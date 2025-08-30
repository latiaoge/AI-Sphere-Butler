import time
from typing import List, Optional, Tuple, Union

from packaging import version
import importlib
vllm_version = version.parse(importlib.import_module("vllm").__version__)

# 在 vllm 中注册自定义的 GPT2TTSModel
from vllm import ModelRegistry
if vllm_version > version.parse("0.7.3"):
    from indextts.gpt.index_tts_gpt2_new import GPT2TTSModel
else:
    from indextts.gpt.index_tts_gpt2 import GPT2TTSModel
ModelRegistry.register_model("GPT2InferenceModel", GPT2TTSModel)
print("✅ Registry GPT2TTSModel to vllm")



# 解除 vllm 对 repetition_penalty 的限制
from vllm.sampling_params import SamplingParams
original_verify_args = SamplingParams._verify_args

def patched_verify_args(self) -> None:
    repetition_penalty_temp = -1
    if self.repetition_penalty > 2.0:
        repetition_penalty_temp = self.repetition_penalty
        self.repetition_penalty = 2.0
    original_verify_args(self)
    if repetition_penalty_temp != -1:
        self.repetition_penalty = repetition_penalty_temp

SamplingParams._verify_args = patched_verify_args
print("⚠️  SamplingParams._verify_args Patched")



# # 使得每次 forward 都带有传入的 multi_modal_data
# from vllm.core.scheduler import Scheduler, SchedulerOutputs
# from vllm.sequence import SequenceGroupMetadata
# original_schedule = Scheduler.schedule

# def patched_schedule(self) -> Tuple[List[SequenceGroupMetadata], SchedulerOutputs, bool]:
#     seq_group_metadata_list, scheduler_outputs, allow_async_output_proc = original_schedule(self)
#     for seq_group_metadata, scheduled_seq_group in zip(seq_group_metadata_list, scheduler_outputs.scheduled_seq_groups):
#         seq_group = scheduled_seq_group.seq_group
#         seq_group_metadata.multi_modal_data = seq_group.multi_modal_data
#         # print("seq_group_metadata.multi_modal_data", seq_group_metadata.multi_modal_data)

#     return (seq_group_metadata_list, scheduler_outputs, allow_async_output_proc)

# Scheduler.schedule = patched_schedule
# print("⚠️  Scheduler.schedule Patched")


# 将 position_ids 减去 prefill 的长度再加 2，以便计算每一步 decode 的 position embed
from vllm.worker.model_runner import ModelInputForGPUBuilder
from vllm.sequence import SequenceGroupMetadata
from vllm.model_executor.layers.rotary_embedding import MRotaryEmbedding

def patched_compute_lens(self, inter_data: ModelInputForGPUBuilder.InterDataForSeqGroup, seq_idx: int,
                    seq_group_metadata: SequenceGroupMetadata):
    """Compute context length, sequence length and tokens
    for the given sequence data.
    """
    seq_data = seq_group_metadata.seq_data[inter_data.seq_ids[seq_idx]]
    token_chunk_size = seq_group_metadata.token_chunk_size

    # Compute context length (the number of tokens that are
    # already computed) and sequence length (total number of tokens).

    seq_len = seq_data.get_len()
    if inter_data.is_prompt:
        context_len = seq_data.get_num_computed_tokens()
        seq_len = min(seq_len, context_len + token_chunk_size)
    elif self.runner.scheduler_config.is_multi_step or \
        self.runner.model_config.is_encoder_decoder:
        context_len = seq_len - 1
    else:
        context_len = seq_data.get_num_computed_tokens()

    # Compute tokens.
    tokens = seq_data.get_token_ids()[context_len:seq_len]
    token_types = seq_group_metadata.token_type_ids

    inter_data.seq_lens[seq_idx] = seq_len
    inter_data.orig_seq_lens[seq_idx] = seq_len
    inter_data.context_lens[seq_idx] = context_len
    inter_data.input_tokens[seq_idx].extend(tokens)
    # inter_data.input_positions[seq_idx].extend(range(context_len, seq_len))
    pos_bias = seq_data.get_prompt_len() - 2
    inter_data.input_positions[seq_idx].extend(range(context_len-pos_bias, seq_len-pos_bias))
    inter_data.token_types[seq_idx].extend(
        token_types if token_types else [])
    inter_data.query_lens[seq_idx] = seq_len - context_len

    if seq_data.mrope_position_delta is not None:
        if inter_data.mrope_input_positions is None:
            inter_data.mrope_input_positions = [None] * inter_data.n_seqs

        inter_data.mrope_input_positions[
            seq_idx] = MRotaryEmbedding.get_next_input_positions(
                seq_data.mrope_position_delta,
                context_len,
                seq_len,
            )

ModelInputForGPUBuilder._compute_lens = patched_compute_lens
print("⚠️  ModelInputForGPUBuilder._compute_lens Patched")



# # 实现返回 hidden_states

# # 1. 令 SamplerOutput 返回 hidden_states
# from vllm.worker.model_runner import GPUModelRunnerBase
# from vllm.inputs import INPUT_REGISTRY, InputRegistry
# from vllm.config import VllmConfig
# from vllm.multimodal import (MULTIMODAL_REGISTRY, MultiModalRegistry)

# original_gpumodelrunnerbase = GPUModelRunnerBase.__init__

# def patched_gpu_runner_init(
#     self,
#     vllm_config: VllmConfig,
#     kv_cache_dtype: Optional[str] = "auto",
#     is_driver_worker: bool = False,
#     return_hidden_states: bool = True,
#     input_registry: InputRegistry = INPUT_REGISTRY,
#     mm_registry: MultiModalRegistry = MULTIMODAL_REGISTRY,
# ):
#     original_gpumodelrunnerbase(
#         self,
#         vllm_config=vllm_config,
#         kv_cache_dtype=kv_cache_dtype,
#         is_driver_worker=is_driver_worker,
#         return_hidden_states=return_hidden_states,
#         input_registry=input_registry,
#         mm_registry=mm_registry,
#     )

# GPUModelRunnerBase.__init__ = patched_gpu_runner_init
# print("⚠️  GPUModelRunnerBase.__init__ Patched")


# # 2. 进一步将 hidden_states 传到 RequestOutput 中
# from vllm.engine.async_llm_engine import _AsyncLLMEngine
# from vllm.outputs import PoolingRequestOutput, RequestOutput
# from vllm.sequence import ExecuteModelRequest
# from vllm.engine.llm_engine import SchedulerOutputState

# # # 为 RequestOutput 增加 hidden_states
# # original_requestoutput = RequestOutput.__init__

# # def new_init(self, *args, **kwargs):
# #     original_requestoutput(self, *args, **kwargs)
# #     self.hidden_states = None

# # RequestOutput.__init__ = new_init
# # print("⚠️  RequestOutput.__init__ Patched")

# # prefill 阶段走这条路
# async def patched_step_async(
#         self, virtual_engine: int
#     ) -> List[Union[RequestOutput, PoolingRequestOutput]]:
#         """Performs one decoding iteration and returns newly generated results.
#         The workers are ran asynchronously if possible.

#         This function performs one decoding iteration of the engine. It first
#         schedules the sequences to be executed in the next iteration and the
#         token blocks to be swapped in/out/copy. Then, it executes the model
#         and updates the scheduler with the model outputs. Finally, it decodes
#         the sequences and returns the newly generated results.
#         """
#         # these are cached outputs from previous iterations. None if on first
#         # iteration
#         cached_outputs = self.cached_scheduler_outputs[virtual_engine]
#         seq_group_metadata_list = cached_outputs.seq_group_metadata_list
#         scheduler_outputs = cached_outputs.scheduler_outputs
#         allow_async_output_proc = cached_outputs.allow_async_output_proc

#         ctx = self.scheduler_contexts[virtual_engine]

#         # Clear outputs for each new scheduler iteration
#         ctx.request_outputs.clear()

#         # skip the scheduler if there are any remaining steps in the seq groups.
#         # This ensures that the scheduler is only called again when the current
#         # batch has completed.
#         if not self._has_remaining_steps(seq_group_metadata_list):

#             # Schedule iteration
#             (seq_group_metadata_list, scheduler_outputs,
#              allow_async_output_proc
#              ) = self.scheduler[virtual_engine].schedule()

#             ctx.seq_group_metadata_list = seq_group_metadata_list
#             ctx.scheduler_outputs = scheduler_outputs

#             finished_requests_ids = self.scheduler[
#                 virtual_engine].get_and_reset_finished_requests_ids()

#             # Maybe switch from async mode to sync mode
#             if not allow_async_output_proc and len(ctx.output_queue) > 0:
#                 self._process_model_outputs(ctx=ctx)

#             if (self.scheduler_config.is_multi_step
#                     and scheduler_outputs.num_lookahead_slots > 0):
#                 # cache the scheduler outputs for the next iteration if we have
#                 # lookahead slots
#                 self._cache_scheduler_outputs_for_multi_step(
#                     virtual_engine, seq_group_metadata_list, scheduler_outputs,
#                     allow_async_output_proc)
#         else:
#             finished_requests_ids = list()

#         assert seq_group_metadata_list is not None
#         assert scheduler_outputs is not None

#         if not scheduler_outputs.is_empty():

#             # Check if we have a cached last_output from the previous iteration.
#             # For supporting PP this is probably the best way to pass the
#             # sampled_token_ids, as a separate broadcast over all the PP stages
#             # will cause one virtual engine's microbatch to block the pipeline.
#             last_sampled_token_ids = \
#                 self._get_last_sampled_token_ids(virtual_engine)

#             execute_model_req = ExecuteModelRequest(
#                 seq_group_metadata_list=seq_group_metadata_list,
#                 blocks_to_swap_in=scheduler_outputs.blocks_to_swap_in,
#                 blocks_to_swap_out=scheduler_outputs.blocks_to_swap_out,
#                 blocks_to_copy=scheduler_outputs.blocks_to_copy,
#                 virtual_engine=virtual_engine,
#                 num_lookahead_slots=scheduler_outputs.num_lookahead_slots,
#                 running_queue_size=scheduler_outputs.running_queue_size,
#                 finished_requests_ids=finished_requests_ids,
#                 # We use ExecuteModelRequest to pass the last sampled_token_ids
#                 # to each of the non-last PP stages for in-place prepare_input.
#                 last_sampled_token_ids=last_sampled_token_ids)

#             if allow_async_output_proc:
#                 execute_model_req.async_callback = self.async_callbacks[
#                     virtual_engine]

#             # Execute the model.
#             outputs = await self.model_executor.execute_model_async(
#                 execute_model_req)

#             # we need to do this here so that last step's sampled_token_ids can
#             # be passed to the next iteration for PP.
#             if self.scheduler_config.is_multi_step:
#                 self._update_cached_scheduler_output(virtual_engine, outputs)
#         else:
#             if len(ctx.output_queue) > 0:
#                 self._process_model_outputs(ctx=ctx)
#             outputs = []

#         # Finish the current step for all the sequence groups.
#         if self.scheduler_config.is_multi_step:
#             for seq_group in seq_group_metadata_list:
#                 seq_group.finish_step()

#         if not self._has_remaining_steps(seq_group_metadata_list):
#             # Clear the cache if we have finished all the steps
#             if self.scheduler_config.is_multi_step:
#                 self.cached_scheduler_outputs[
#                     virtual_engine] = SchedulerOutputState()

#             # is_first_step_output is True only when the num_steps of all
#             # the sequences are 1. When the num_steps > 1,
#             # multi_step_model_runner does the first-step output append.
#             is_first_step_output: bool = False if not seq_group_metadata_list \
#                 else seq_group_metadata_list[0].state.num_steps == 1

#             ctx.append_output(outputs=outputs,
#                               seq_group_metadata_list=seq_group_metadata_list,
#                               scheduler_outputs=scheduler_outputs,
#                               is_async=allow_async_output_proc,
#                               is_last_step=True,
#                               is_first_step_output=is_first_step_output)

#             if outputs and allow_async_output_proc:
#                 assert len(
#                     outputs
#                 ) == 1, "Async postprocessor expects only a single output set"
#                 self._advance_to_next_step(
#                     outputs[0], seq_group_metadata_list,
#                     scheduler_outputs.scheduled_seq_groups)
            
#             if not allow_async_output_proc:
#                 self._process_model_outputs(ctx=ctx)

#                 # Log stats.
#                 self.do_log_stats(scheduler_outputs, outputs)

#                 # Tracing
#                 self.do_tracing(scheduler_outputs)

#         else:
#             # Multi-step case
#             return ctx.request_outputs

#         if not self.has_unfinished_requests():
#             # Drain async postprocessor (if exists)
#             if len(ctx.output_queue) > 0:
#                 self._process_model_outputs(ctx=ctx)
#             assert len(ctx.output_queue) == 0
        
#         # print("step_async outputs", outputs)
#         for idx in range(len(ctx.request_outputs)):
#             ctx.request_outputs[idx].hidden_states = outputs[0].hidden_states[idx: idx+1]
#         return ctx.request_outputs

# _AsyncLLMEngine.step_async = patched_step_async
# print("⚠️  _AsyncLLMEngine.step_async Patched")


# # decode 阶段会走这条路
# from vllm.engine.llm_engine import LLMEngine, SchedulerContext
# from vllm.sequence import (SequenceGroup, SequenceGroupOutput)
# from vllm.engine.output_processor.util import create_output_by_sequence_group
# from vllm.model_executor.layers.sampler import SamplerOutput
# from vllm.outputs import RequestOutputFactory
# from vllm.sampling_params import RequestOutputKind

# def patched_process_model_outputs(self,
#                             ctx: SchedulerContext,
#                             request_id: Optional[str] = None) -> None:
#         """Apply the model output to the sequences in the scheduled seq groups
#         and return responses.

#         ctx: The virtual engine context to work on
#         request_id: If provided, then only this request is going to be processed
#         """

#         now = time.time()

#         if len(ctx.output_queue) == 0:
#             return None

#         # Get pending async postprocessor
#         if request_id:
#             # When we process only one request, no pop is required
#             # (since later we will process all of the rest)
#             (outputs, seq_group_metadata_list, scheduler_outputs, is_async,
#              is_last_step, is_first_step_output, skip) = ctx.output_queue[0]
#         else:
#             (outputs, seq_group_metadata_list, scheduler_outputs, is_async,
#              is_last_step, is_first_step_output,
#              skip) = ctx.output_queue.popleft()

#         # Sanity check
#         assert len(seq_group_metadata_list) == len(
#             scheduler_outputs.scheduled_seq_groups)

#         has_multiple_outputs: bool = len(outputs) > 1
#         outputs_by_sequence_group: List[List[SequenceGroupOutput]]
#         if has_multiple_outputs:
#             assert self.scheduler_config.is_multi_step or \
#                      self.speculative_config
#             # Organize outputs by [step][sequence group] instead of
#             # [sequence group][step].
#             if self.scheduler_config.is_multi_step:
#                 outputs_by_sequence_group = create_output_by_sequence_group(
#                     outputs, len(seq_group_metadata_list))
#             elif self.speculative_config:
#                 # Decodes are multi-steps while prefills are not, outputting at
#                 # most 1 token. Separate them so that we can trigger chunk
#                 # processing without having to pad or copy over prompts K times
#                 # to match decodes structure (costly with prompt_logprobs).
#                 num_prefills = sum(sg.is_prompt
#                                    for sg in seq_group_metadata_list)
#                 prefills, decodes = outputs[:num_prefills], outputs[
#                     num_prefills:]
#                 outputs_by_sequence_group = create_output_by_sequence_group(
#                     decodes,
#                     num_seq_groups=len(seq_group_metadata_list) - num_prefills)
#                 outputs_by_sequence_group = [p.outputs for p in prefills
#                                              ] + outputs_by_sequence_group
#             # We have outputs for multiple steps submitted in a single burst,
#             # so invalidate is_first_step_output.
#             is_first_step_output = None
#         else:
#             outputs_by_sequence_group = outputs

#         # Determine the requests we need to operate on
#         if request_id:
#             indices = []
#             for i, seq_group_meta in enumerate(seq_group_metadata_list):
#                 if seq_group_meta.request_id == request_id:
#                     assert i not in skip  # Cannot be called twice
#                     indices.append(i)
#                     break

#             # If the request_id was not found, then it means that
#             # this is a new request that has no pending async
#             # postprocessor
#             if not indices:
#                 return
#         else:
#             indices = range(len(seq_group_metadata_list))  # type: ignore

#         finished_before: List[int] = []
#         finished_now: List[int] = []
#         for i in indices:
#             if i in skip:
#                 continue

#             seq_group_meta = seq_group_metadata_list[i]
#             scheduled_seq_group = scheduler_outputs.scheduled_seq_groups[i]

#             seq_group: SequenceGroup = scheduled_seq_group.seq_group

#             if seq_group.is_finished():
#                 finished_before.append(i)
#                 continue

#             output: List[SequenceGroupOutput]
#             if has_multiple_outputs:
#                 output = outputs_by_sequence_group[i]
#             else:
#                 output = [outputs_by_sequence_group[0][i]]

#             if not is_async:
#                 if self.scheduler_config.is_multi_step:
#                     # Updates happen only if the sequence is prefill
#                     self._update_num_computed_tokens_for_multi_step_prefill(
#                         seq_group, seq_group_meta, is_first_step_output)
#                 else:
#                     seq_group.update_num_computed_tokens(
#                         seq_group_meta.token_chunk_size or 0)

#             if outputs:
#                 for o in outputs:
#                     if (isinstance(o, SamplerOutput)
#                             and seq_group.metrics is not None):
#                         if seq_group.metrics.model_forward_time is not None:
#                             seq_group.metrics.model_forward_time += (
#                                 o.model_forward_time or 0)
#                         else:
#                             seq_group.metrics.model_forward_time = (
#                                 o.model_forward_time)
#                         if seq_group.metrics.model_execute_time is not None:
#                             seq_group.metrics.model_execute_time += (
#                                 o.model_execute_time or 0)
#                         else:
#                             seq_group.metrics.model_execute_time = (
#                                 o.model_execute_time)

#             if self.model_config.runner_type == "pooling":
#                 self._process_sequence_group_outputs(seq_group, output)
#             else:
#                 self.output_processor.process_prompt_logprob(seq_group, output)
#                 if seq_group_meta.do_sample:
#                     self.output_processor.process_outputs(
#                         seq_group, output, is_async)

#             if seq_group.is_finished():
#                 finished_now.append(i)

#         # Generate outputs for the requests that finished this iteration
#         # print("process_model_outputs1 outputs", len(outputs), [hs.shape for hs in outputs[0].hidden_states])
#         for i in finished_now:
#             scheduled_seq_group = scheduler_outputs.scheduled_seq_groups[i]

#             seq_group = scheduled_seq_group.seq_group
#             seq_group.maybe_set_first_token_time(now)
#             if not seq_group.is_prefill():
#                 seq_group.set_last_token_time(now)
#             request_output = RequestOutputFactory.create(
#                 seq_group,
#                 self.seq_id_to_seq_group,
#                 use_cache=self.use_cached_outputs)
#             if request_output:
#                 request_output.hidden_states = outputs[0].hidden_states[i: i+1]
#                 ctx.request_outputs.append(request_output)

#         # When we process a single request, we skip it for the next time,
#         # and invoke the request output callback (if there was final output)
#         if request_id:
#             assert len(indices) == 1
#             skip.append(indices[0])

#             if (finished_now
#                     and self.process_request_outputs_callback is not None):
#                 self.process_request_outputs_callback(ctx.request_outputs)
#                 ctx.request_outputs.clear()
#             return

#         # Free currently finished requests
#         if finished_now:
#             for scheduler in self.scheduler:
#                 scheduler.free_finished_seq_groups()

#         # For multi-step without streaming, don't create outputs each iteration
#         if not is_last_step and not ctx.multi_step_stream_outputs:
#             # Immediately process request outputs here (if callback is given)
#             if (finished_now
#                     and self.process_request_outputs_callback is not None):
#                 self.process_request_outputs_callback(ctx.request_outputs)
#                 ctx.request_outputs.clear()
#             return

#         # Create the outputs
#         # print("process_model_outputs2 outputs", len(outputs), [hs.shape for hs in outputs[0].hidden_states])
#         for i in indices:
#             if i in skip or i in finished_before or i in finished_now:
#                 continue  # Avoids double processing

#             scheduled_seq_group = scheduler_outputs.scheduled_seq_groups[i]

#             seq_group = scheduled_seq_group.seq_group
#             seq_group.maybe_set_first_token_time(now)
#             if not seq_group.is_prefill():
#                 seq_group.set_last_token_time(now)
#             request_output = RequestOutputFactory.create(
#                 seq_group,
#                 self.seq_id_to_seq_group,
#                 use_cache=self.use_cached_outputs)
#             if request_output:
#                 request_output.hidden_states = outputs[0].hidden_states[i: i+1]
#                 ctx.request_outputs.append(request_output)

#         # For multi-step with streaming, create outputs each iteration
#         if not is_last_step and ctx.multi_step_stream_outputs:
#             # Immediately process request outputs here (if callback is given)
#             if self.process_request_outputs_callback is not None:
#                 self.process_request_outputs_callback(ctx.request_outputs)
#                 ctx.request_outputs.clear()
#             return

#         for seq_group in scheduler_outputs.ignored_seq_groups:
#             params = seq_group.sampling_params
#             if params is not None and params.output_kind == (
#                     RequestOutputKind.DELTA) and not seq_group.is_finished():
#                 continue

#             request_output = RequestOutputFactory.create(
#                 seq_group,
#                 self.seq_id_to_seq_group,
#                 use_cache=self.use_cached_outputs,
#             )
#             if request_output:
#                 ctx.request_outputs.append(request_output)

#         # Immediately process request outputs here (if callback is given)
#         if (ctx.request_outputs
#                 and self.process_request_outputs_callback is not None):
#             self.process_request_outputs_callback(ctx.request_outputs)
#             ctx.request_outputs.clear()

#         # For async case, we need to record the stats here.
#         # For non-async case, the stats are done in the
#         # LLMEngine/AsyncLLMEngine directly
#         if is_async:
#             # Log stats.
#             self.do_log_stats(scheduler_outputs, outputs, finished_before,
#                               skip)

#             # Tracing
#             self.do_tracing(scheduler_outputs, finished_before)

#         return None

# LLMEngine._process_model_outputs = patched_process_model_outputs
# print("⚠️  LLMEngine._process_model_outputs Patched")