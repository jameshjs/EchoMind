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
    try:
        model = genai.GenerativeModel('gemini-pro-vision')
        prompt = f"""
        Below is a journal entry. Your job is to read it and create a line-art cartoon to visualize. Make it positive even if it is bad.

        Journal Entry:
        {journal_entry}
        """
        
        response = model.generate_content(prompt)
        
        # Extract image data from response
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_data = base64.b64decode(part.inline_data.data)
                image = Image.open(BytesIO(image_data))
                return image  # Return the image object
                
        print("No image was generated")
        return None

    except Exception as e:
        print("Error generating image:", str(e))
        return None

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

# Initialize database when starting the app
if __name__ == '__main__':
    init_db()
    app.run(debug=True)
