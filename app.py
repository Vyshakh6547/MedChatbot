from flask import Flask, request, jsonify, render_template, send_file
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
from gtts import gTTS
import os
import torch
from transformers import BitsAndBytesConfig
import whisper

# Initialize the Flask app
app = Flask(__name__)

# Load the model with quantization
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16
)

base_model_id = "./Mistral7B"
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True
)
ft_model = PeftModel.from_pretrained(base_model, "./mistral-finetuned") 
eval_tokenizer = AutoTokenizer.from_pretrained(base_model_id, add_bos_token=True, trust_remote_code=True)

whisper_model = whisper.load_model("base") # Use "base", "small", "medium", or "large"

# Define a route for the homepage
@app.route('/')
def home():
    return render_template('index.html')

# API route for generating responses
@app.route('/generate', methods=['POST'])
def generate():
    user_input = request.form['user_input']
    # Prepend "Answer the following" to the input
    formatted_input = f"Instruction: {user_input} Response:" 
    inputs = eval_tokenizer(formatted_input, return_tensors="pt").to("cuda")
    outputs_ft = ft_model.generate(
        **inputs,
        max_new_tokens=100,
        do_sample=True,
        temperature=0.4,
        top_p=0.9,
        repetition_penalty=1.2,
        eos_token_id=eval_tokenizer.eos_token_id
    )
    response_ft = eval_tokenizer.decode(outputs_ft[0], skip_special_tokens=True)
    response_ft = response_ft.split("Response:")[1].strip()  # Extract the response after "Response:"
    response_ft = response_ft.split("##")[0].strip()
    return jsonify({"response_fine_tuned": response_ft})  # Only return fine-tuned response

# API route for text-to-speech
@app.route('/tts', methods=['POST'])
def text_to_speech():
    text = request.form['text']
    tts = gTTS(text=text, lang='en')
    audio_path = "response.mp3"
    tts.save(audio_path)
    return send_file(audio_path, as_attachment=True)

# API route for speech-to-text
@app.route('/stt', methods=['POST'])
def speech_to_text():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400

    audio_file = request.files['audio']
    audio_path = "uploaded_audio.wav"
    audio_file.save(audio_path)

    try:
        # Use Whisper to transcribe audio
        result = whisper_model.transcribe(audio_path)
        text = result.get("text", "").strip()
        if not text:
            return jsonify({"error": "Speech not recognized"}), 400
        return jsonify({"text": text})  # Return only the recognized text
    except Exception as e:
        return jsonify({"error": f"Speech transcription failed: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)