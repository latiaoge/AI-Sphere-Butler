import functools

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import GPT2Config, GPT2LMHeadModel, LogitsProcessorList
from transformers.modeling_outputs import CausalLMOutputWithCrossAttentions
from transformers.utils.model_parallel_utils import (assert_device_map,
                                                     get_device_map)
from transformers import GPT2Config, GPT2Model

from indextts.gpt.conformer_encoder import ConformerEncoder
from indextts.gpt.perceiver import PerceiverResampler
from indextts.utils.arch_util import AttentionBlock
from indextts.utils.typical_sampling import TypicalLogitsWarper


def null_position_embeddings(range, dim):
    return torch.zeros((range.shape[0], range.shape[1], dim), device=range.device)


class GPT2InferenceModel(GPT2LMHeadModel):
    def __init__(self, config, gpt, text_pos_emb, audio_emb, norm, linear):
        super().__init__(config)
        self.transformer = gpt
        self.text_pos_embedding = text_pos_emb
        self.audio_emb = audio_emb
        self.final_norm = norm
        self.lm_head = linear

    def store_mel_emb(self, mel_emb):
        self.cached_mel_emb = mel_emb

    def forward(
            self,
            input_ids=None,
            past_key_values=None,
            attention_mask=None,
            token_type_ids=None,
            position_ids=None,
            head_mask=None,
            inputs_embeds=None,
            encoder_hidden_states=None,
            encoder_attention_mask=None,
            labels=None,
            use_cache=None,
            output_attentions=None,
            output_hidden_states=None,
            return_dict=None,
            **kwargs
    ):
        assert input_ids is None or input_ids.shape[1] == 1
        return_dict = (
            return_dict if return_dict is not None else self.config.use_return_dict
        )

        # # Create embedding
        mel_len = self.cached_mel_emb.shape[1]
        if input_ids is not None:  #  and input_ids.shape[1] == 1
            inputs_embeds = self.audio_emb(input_ids)
            inputs_embeds = inputs_embeds + self.text_pos_embedding.get_fixed_embedding(
                attention_mask.shape[1] - mel_len, attention_mask.device
            )
        transformer_outputs = self.transformer(
            inputs_embeds=inputs_embeds,
            past_key_values=past_key_values,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            position_ids=position_ids,
            head_mask=head_mask,
            encoder_hidden_states=encoder_hidden_states,
            encoder_attention_mask=encoder_attention_mask,
            use_cache=use_cache,
            output_attentions=output_attentions,
            output_hidden_states=output_hidden_states,
            return_dict=return_dict,
        )
        hidden_states = transformer_outputs[0]

        # Set device for model parallelism
        if self.model_parallel:
            if torch.backends.mps.is_available():
                self.to(self.transformer.first_device)
            else:
                torch.cuda.set_device(self.transformer.first_device)
            hidden_states = hidden_states.to(self.lm_head.weight.device)

        lm_logits = self.lm_head(self.final_norm(hidden_states))

        if not return_dict:
            return (lm_logits,) + transformer_outputs[1:]

        return CausalLMOutputWithCrossAttentions(
            loss=None,
            logits=lm_logits,
            past_key_values=transformer_outputs.past_key_values,
            hidden_states=transformer_outputs.last_hidden_state,
            attentions=transformer_outputs.attentions,
            cross_attentions=transformer_outputs.cross_attentions,
        )
    

class LearnedPositionEmbeddings(nn.Module):
    def __init__(self, seq_len, model_dim, init=.02):
        super().__init__()
        self.emb = nn.Embedding(seq_len, model_dim)
        # Initializing this way is standard for GPT-2
        self.emb.weight.data.normal_(mean=0.0, std=init)

    def forward(self, x):
        sl = x.shape[1]
        return self.emb(torch.arange(0, sl, device=x.device))

    def get_fixed_embedding(self, ind, dev):
        return self.emb(torch.tensor([ind], device=dev)).unsqueeze(0)


class UnifiedVoice(nn.Module):
    def __init__(self, layers=8, model_dim=512, heads=8, max_text_tokens=120, max_mel_tokens=250, max_conditioning_inputs=1,
                 mel_length_compression=1024, number_text_tokens=256,
                 start_text_token=0, stop_text_token=1, number_mel_codes=8194, start_mel_token=8192, stop_mel_token=8193,
                 types=1, activation_function=None,
                 condition_num_latent=32, condition_module=None, **kwargs):
        """
        Args:
            layers: Number of layers in transformer stack.
            model_dim: Operating dimensions of the transformer
            heads: Number of transformer heads. Must be divisible by model_dim. Recommend model_dim//64
            max_text_tokens: Maximum number of text tokens that will be encountered by model.
            max_mel_tokens: Maximum number of MEL tokens that will be encountered by model.
            max_conditioning_inputs: Maximum number of conditioning inputs provided to the model. If (1), conditioning input can be of format (b,80,s), otherwise (b,n,80,s).
            mel_length_compression: The factor between <number_input_samples> and <mel_tokens>. Used to compute MEL code padding given wav input length.
            number_text_tokens:
            start_text_token:
            stop_text_token:
            number_mel_codes:
            start_mel_token:
            stop_mel_token:
            checkpointing:
        """
        super().__init__()
        self.number_text_tokens = number_text_tokens
        self.start_text_token = start_text_token
        self.stop_text_token = stop_text_token
        self.number_mel_codes = number_mel_codes
        self.start_mel_token = start_mel_token
        self.stop_mel_token = stop_mel_token
        self.layers = layers
        self.heads = heads
        self.max_mel_tokens = max_mel_tokens
        self.max_text_tokens = max_text_tokens
        self.model_dim = model_dim
        self.max_conditioning_inputs = max_conditioning_inputs
        self.mel_length_compression = mel_length_compression
        self.cond_num = condition_num_latent
        self.cond_mask_pad = nn.ConstantPad1d((self.cond_num, 0), True)

        self.conditioning_encoder = ConformerEncoder(input_size=100,
                                                        output_size=condition_module['output_size'],
                                                        linear_units=condition_module['linear_units'],
                                                        attention_heads=condition_module['attention_heads'],
                                                        num_blocks=condition_module['num_blocks'],
                                                        input_layer=condition_module['input_layer'])
        self.perceiver_encoder = PerceiverResampler(model_dim, dim_context=condition_module['output_size'],
                                                    ff_mult=condition_module['perceiver_mult'],
                                                    heads=condition_module['attention_heads'],
                                                    num_latents=self.cond_num)

        self.text_embedding = nn.Embedding(self.number_text_tokens * types + 1, model_dim)
        self.mel_embedding = nn.Embedding(self.number_mel_codes, model_dim)

        max_mel_seq_len = self.max_mel_tokens + 2 + self.max_conditioning_inputs
        max_text_seq_len = self.max_text_tokens + 2
        gpt_config = GPT2Config(vocab_size=256,  # Unused.
                                n_positions=max_mel_seq_len + max_text_seq_len,
                                n_ctx=max_mel_seq_len + max_text_seq_len,
                                n_embd=model_dim,
                                n_layer=layers,
                                n_head=heads,
                                activation_function=activation_function or "gelu_new",
                                gradient_checkpointing=False,
                                use_cache=True)
        self.gpt = GPT2Model(gpt_config)
        # Override the built in positional embeddings
        del self.gpt.wpe
        self.gpt.wpe = functools.partial(null_position_embeddings, dim=model_dim)
        # Built-in token embeddings are unused.
        del self.gpt.wte
        self.mel_pos_embedding, self.text_pos_embedding  = LearnedPositionEmbeddings(max_mel_seq_len, model_dim), LearnedPositionEmbeddings(max_text_seq_len, model_dim)

        self.mel_solo_embedding = 0
        self.text_solo_embedding = 0

        self.final_norm = nn.LayerNorm(model_dim)
        self.text_head = nn.Linear(model_dim, self.number_text_tokens * types + 1)
        self.mel_head = nn.Linear(model_dim, self.number_mel_codes)

        # Initialize the embeddings per the GPT-2 scheme
        embeddings = [self.text_embedding, self.mel_embedding]
        for module in embeddings:
            module.weight.data.normal_(mean=0.0, std=.02)

    def post_init_gpt2_config(self, use_deepspeed=False, kv_cache=False, half=False, activation_function=None):
        seq_length = self.max_mel_tokens + self.max_text_tokens + 2
        gpt_config = GPT2Config(
            vocab_size=self.number_mel_codes,
            n_positions=self.max_mel_tokens + 2 + self.max_conditioning_inputs,
            n_ctx=seq_length,
            n_embd=self.model_dim,
            n_layer=self.layers,
            n_head=self.heads,
            gradient_checkpointing=False,
            activation_function=activation_function or "gelu_new",
            use_cache=True,
            bos_token_id=self.start_mel_token,
            eos_token_id=self.stop_mel_token,
        )
        self.inference_model = GPT2InferenceModel(
            gpt_config,
            self.gpt,
            self.mel_pos_embedding,
            self.mel_embedding,
            self.final_norm,
            self.mel_head,
            # kv_cache=kv_cache,
        )
        self.inference_model = self.inference_model.eval()

        # self.gpt.wte = self.mel_embedding

    def build_aligned_inputs_and_targets(self, input, start_token, stop_token):
        inp = F.pad(input, (1, 0), value=start_token)
        tar = F.pad(input, (0, 1), value=stop_token)
        return inp, tar

    def get_conditioning(self, speech_conditioning_input, cond_mel_lengths=None):
        speech_conditioning_input, mask = self.conditioning_encoder(speech_conditioning_input.transpose(1, 2),
                                                                    cond_mel_lengths)  # (b, s, d), (b, 1, s)
        conds_mask = self.cond_mask_pad(mask.squeeze(1))
        conds = self.perceiver_encoder(speech_conditioning_input, conds_mask)  # (b, 32, d)
        return conds

    def inference_speech(self, speech_conditioning_latent, text_inputs, cond_mel_lengths=None, input_tokens=None, num_return_sequences=1,
                         max_generate_length=None, typical_sampling=False, typical_mass=.9, **hf_generate_kwargs):

        text_inputs = F.pad(text_inputs, (0, 1), value=self.stop_text_token)
        text_inputs, _ = self.build_aligned_inputs_and_targets(text_inputs, self.start_text_token, self.stop_text_token)
        text_emb = self.text_embedding(text_inputs) + self.text_pos_embedding(text_inputs)

        # speech_conditioning_latent = self.get_conditioning(speech_conditioning_latent, cond_mel_lengths)
        # conds = speech_conditioning_latent
        emb = torch.cat([speech_conditioning_latent, text_emb], dim=1)
        self.inference_model.store_mel_emb(emb)
        trunc_index = emb.shape[1] + 1

        mel_start_emb = self.mel_embedding(torch.full((emb.shape[0], 1,), fill_value=self.start_mel_token, dtype=torch.long, device=text_inputs.device))
        mel_start_emb = mel_start_emb + self.mel_pos_embedding(mel_start_emb)
        inputs_embeds = torch.cat([emb, mel_start_emb], dim=1)

        logits_processor = LogitsProcessorList()
        max_length = trunc_index + self.max_mel_tokens - 1 if max_generate_length is None else trunc_index + max_generate_length
        gen = self.inference_model.generate(inputs_embeds=inputs_embeds, bos_token_id=self.start_mel_token, pad_token_id=self.stop_mel_token,
                                            eos_token_id=self.stop_mel_token,
                                            return_dict_in_generate=True, output_hidden_states=True,
                                            max_length=max_length, logits_processor=logits_processor,
                                            num_return_sequences=num_return_sequences, **hf_generate_kwargs)
        codes = gen.sequences[:, 1:]
        latent = torch.cat(gen.hidden_states, dim=1)
        latent = latent[:, trunc_index:-1]
        latent = self.final_norm(latent)
        return codes, latent  # [:, trunc_index:]
