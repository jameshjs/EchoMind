import google.generativeai as genai
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from gradio_client import Client
from google.generativeai import types
import os
from dotenv import load_dotenv
# from google.genai import types
from PIL import Image
from io import BytesIO
import base64
import sqlite3
from datetime import datetime
import shutil
import os.path
import time


# Load environment variables from .env file
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Add database initialization
def init_db():
    conn = sqlite3.connect('journal.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            transcript TEXT NOT NULL,
            emotion TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# Create audio storage directory
AUDIO_UPLOAD_FOLDER = 'audio_uploads'
if not os.path.exists(AUDIO_UPLOAD_FOLDER):
    os.makedirs(AUDIO_UPLOAD_FOLDER)

# Global client variable
musicgen_client = None
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

def init_musicgen_client():
    global musicgen_client
    retry_count = 0
    while retry_count < MAX_RETRIES:
        try:
            if musicgen_client is None:
                print(f"Initializing MusicGen client (attempt {retry_count + 1}/{MAX_RETRIES})...")
                musicgen_client = Client("https://facebook-musicgen.hf.space/")
                print("MusicGen client initialized successfully")
                return True
        except Exception as e:
            retry_count += 1
            print(f"Warning: Could not initialize MusicGen client (attempt {retry_count}/{MAX_RETRIES}): {str(e)}")
            if retry_count < MAX_RETRIES:
                print(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
    return False

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route('/greet', methods=['GET'])
def greet():
    result = "it is working"
    return result

@app.route("/input", methods=["GET"])
def read_chat():
    return jsonify({"message": "GET request received"})

@app.route("/input", methods=["POST"])
def chat():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'message' in request body"}), 400
    message = data.get('text')
    response = get_emotion(message)
    return jsonify({"text": response})

def get_emotion(journal_entry):
    prompt = f"""
    Below is a journal entry. Your job is to read it and return 1 emotional that best match the tone and content of the entry.

    Please choose from this exact list of words only:
    love, pride, angry, happy, excited, sad, neutral

    Only reply with the 1 best-fitting word from this list, love and pride is more likely, prefer other words over neutral

    Journal Entry:
    {journal_entry}
    """
    try:
        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(prompt)
        text = response.text.strip().lower()
        
        # Optional: Validate the result is one of the expected emotions
        valid_emotions = {"love", "pride", "angry", "happy", "excited", "sad", "neutral"}
        if text not in valid_emotions:
            print(f"Unexpected response: {text}")
            return "neutral"
        
        return text
    except Exception as e:
        print("Gemini API Error:", str(e))
        return "neutral"

@app.route("/image", methods=["GET"])
def read_image():
    return jsonify({"message": "GET request received"})

@app.route("/image", methods=["POST"])
def image():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'message' in request body"}), 400
    message = data.get('text')
    image = get_image(message)
    
    if image is None:
        return jsonify({"error": "Failed to generate image"}), 500
        
    # Convert PIL Image to bytes
    img_io = BytesIO()
    image.save(img_io, 'PNG')
    img_io.seek(0)
    
    return send_file(
        img_io,
        mimetype='image/png',
        as_attachment=True,
        download_name='generated_image.png'
    )

def get_image(journal_entry):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model="gemini-2.0-flash-exp-image-generation",
        contents=journal_entry,
        config=types.GenerateContentConfig(
            response_modalities=['Text', 'Image']
        )
    )

    for part in response.candidates[0].content.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = Image.open(BytesIO((part.inline_data.data)))
            return image  # Return the image object directly

    return None  # Return None if no image was found

# Define the function
def get_mood_words(journal_entry):

    prompt = f"""
    Below is a journal entry. Your job is to read it and return **only the top 3 mood or emotional words** that best match the tone and content of the entry.

    Please choose from this exact list of words only:
    joyful, happy, cheerful, chipper, amused, upbeat, delighted, thrilled, excited, bubbly, content, satisfied, optimistic, grateful, playful, lively, blissful, exuberant, giddy, jubilant, merry, zestful, sunny, vivacious, laughing, grinning, chuffed, relaxed, calm, peaceful, serene, composed, zen, unruffled, chill, easygoing, comfortable, meditative, mellow, carefree, contented, unperturbed, safe, settled, angry, annoyed, irritated, infuriated, frustrated, enraged, outraged, agitated, hostile, resentful, cross, grumpy, touchy, temperamental, impatient, snappy, sad, melancholy, gloomy, depressed, blue, mournful, heartbroken, morose, sorrowful, wistful, crying, glum, unhappy, hopeless, lonely, low, dejected, anxious, nervous, afraid, scared, fearful, insecure, uneasy, petrified, alarmed, jumpy, tense, jittery, worried, distressed, threatened, panicked, curious, interested, engaged, enthusiastic, inspired, thoughtful, introspective, contemplative, philosophical, fascinated, absorbed, studious, reflective

    Only reply with the 3 best-fitting words from this list, separated by commas.

    Journal Entry:
    {journal_entry}
    """

    try:
        model = genai.GenerativeModel("models/gemini-1.5-pro-latest")
        response = model.generate_content(prompt)
        text = response.text.strip()
        print("Top 3 Moods:", text)
    except Exception as e:
        print("Gemini API Error:", str(e))

# Add new route to save journal entry
@app.route("/save_entry", methods=["POST"])
def save_entry():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Extract data
        date = data.get('date')
        transcript = data.get('transcript')
        emotion = data.get('emotion')

        # Validate required fields
        # if not all([date, transcript, emotion]):
        #     return jsonify({"error": "Missing required fields"}), 400

        # Save to database
        conn = sqlite3.connect('journal.db')
        c = conn.cursor()
        c.execute('''
            INSERT INTO journal_entries (date, transcript, emotion)
            VALUES (?, ?, ?)
        ''', (date, transcript, emotion))
        
        entry_id = c.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            "message": "Entry saved successfully",
            "id": entry_id
        })

    except Exception as e:
        print("Error saving entry:", str(e))
        return jsonify({"error": "Failed to save entry"}), 500

# Add route to get all entries
@app.route("/get_entries", methods=["GET"])
def get_entries():
    try:
        conn = sqlite3.connect('journal.db')
        c = conn.cursor()
        c.execute('SELECT * FROM journal_entries ORDER BY date DESC')
        entries = c.fetchall()
        conn.close()

        # Convert to list of dictionaries
        entries_list = []
        for entry in entries:
            entry_dict = {
                "id": entry[0],
                "date": entry[1],
                "transcript": entry[2],
                "emotion": entry[3]
            }
            entries_list.append(entry_dict)

        return jsonify(entries_list)

    except Exception as e:
        print("Error getting entries:", str(e))
        return jsonify({"error": "Failed to get entries"}), 500

# Create a dictionary mapping emotions to static music files
STATIC_MUSIC_FILES = {
    "love": "music/1.wav",
    "pride": "music/2.wav",
    "angry": "music/3.wav",
    # Map remaining emotions to the 3 files we have
    "happy": "music/1.wav",
    "excited": "music/2.wav",
    "sad": "music/3.wav",
    "neutral": "music/1.wav"
}

@app.route('/music', methods=['GET'])
def music():
    try:
        text_description = request.args.get('text', default='A calm and peaceful sunset at the beach.', type=str)
        
        # Get the emotion for the text (we'll still log it)
        emotion = get_emotion(text_description)
        print(f"Using {emotion} music for: {text_description}")
        
        # Hard-coded path to the specific music file
        audio_url = "http://127.0.0.1:5000/static/generated_music_-9114550563102685119.wav"
        
        return jsonify({
            "audioUrl": audio_url
        })
        
    except Exception as e:
        return jsonify({
            "error": f"Failed to get music: {str(e)}"
        }), 500

# Add this to serve static files
app.static_folder = 'static'
app.static_url_path = '/static'

# Initialize database when starting the app
if __name__ == '__main__':
    init_db()
    app.run(debug=True)
