MODEL_DIR="checkpoints"
VLLM_DIR="$MODEL_DIR/vllm"

mkdir -p "$VLLM_DIR"

wget https://modelscope.cn/models/openai-community/gpt2/resolve/master/tokenizer.json -O "$VLLM_DIR/tokenizer.json"
wget https://modelscope.cn/models/openai-community/gpt2/resolve/master/tokenizer_config.json -O "$VLLM_DIR/tokenizer_config.json"

python convert_hf_format.py --model_dir "$MODEL_DIR"

echo "All operations completed successfully!"