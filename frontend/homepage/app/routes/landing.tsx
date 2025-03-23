"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Mic, MicOff, Clock, Calendar, ChevronLeft, ChevronRight, Quote, Image as ImageIcon, Music } from "lucide-react"
// import { BlobBackground } from "../components/ui/bg"

// Emotion types
type Emotion = "neutral" | "happy" | "sad" | "angry" | "excited" | "love" | "pride"

// Journal entry type
interface JournalEntry {
  id: string
  date: Date
  transcript: string
  emotion: Emotion
}

// Calendar day type
interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  hasEntry: boolean
  emotion?: Emotion
  entryId?: string
}

// Add API URL constant at the top
const API_URL = 'http://127.0.0.1:5000';

// Add this CSS class near the top of the file, after imports
const imageContainerStyle = {
  position: 'fixed',
  left: '20px',
  bottom: '20px',
  zIndex: 50,
  maxWidth: '300px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  backgroundColor: 'white',
  padding: '8px'
} as const;

export default function VoiceJournal() {
  // State for recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcript, setTranscript] = useState("")

  // State for journal entries
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])

  // State for current emotion
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>("neutral")

  // State for calendar
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  // State to store the selected date
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // State for image generation
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  // State for music generation
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false)
  const [generatedMusic, setGeneratedMusic] = useState<string | null>(null)

  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Ref for speech recognition
  const recognitionRef = useRef<any>(null)

  // Add loading state
  const [isLoading, setIsLoading] = useState(false);

  // Add near the top with other state declarations
  const [pendingEntry, setPendingEntry] = useState<{
    transcript: string;
    emotion: Emotion;
  } | null>(null);

  // Add useEffect to update pendingEntry when transcript or emotion changes
  useEffect(() => {
    if (transcript) {
      setPendingEntry({
        transcript,
        emotion: currentEmotion
      });
    } else {
      setPendingEntry(null);
    }
  }, [transcript, currentEmotion]);

  // Modify the speech recognition onresult handler to update transcript
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true

      recognitionRef.current.onresult = async (event: any) => {
        let interimTranscript = ""
        let finalTranscript = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
            try {
              const response = await fetch('http://127.0.0.1:5000/input', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: finalTranscript }),
              });

              if (!response.ok) {
                throw new Error('Network response was not ok');
              }

              const data = await response.json();
              console.log('API Response:', data);
              
              if (data.text) {
                setCurrentEmotion(data.text);
              }
            } catch (error) {
              console.error('Error sending transcript to API:', error);
            }
          } else {
            interimTranscript += transcript
          }
        }

        // Update transcript state with either final or interim transcript
        setTranscript(finalTranscript || interimTranscript)
      }
    }
  }, []) // Empty dependency array since we only want to set this up once

  // Generate calendar days whenever month or journal entries change
  useEffect(() => {
    generateCalendarDays()
  }, [currentMonth, journalEntries])

  // Generate calendar days for the current month
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    // First day of the month
    const firstDay = new Date(year, month, 1)
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)

    // Day of the week for the first day (0 = Sunday, 6 = Saturday)
    const firstDayOfWeek = firstDay.getDay()

    // Total days in the month
    const daysInMonth = lastDay.getDate()

    // Calculate days from previous month to show
    const daysFromPrevMonth = firstDayOfWeek

    // Calculate days from next month to show (to fill a 6-row calendar)
    const totalCells = 42 // 6 rows x 7 days
    const daysFromNextMonth = totalCells - daysInMonth - daysFromPrevMonth

    const days: CalendarDay[] = []

    // Add days from previous month
    const prevMonth = new Date(year, month - 1, 0)
    const prevMonthDays = prevMonth.getDate()

    for (let i = prevMonthDays - daysFromPrevMonth + 1; i <= prevMonthDays; i++) {
      const date = new Date(year, month - 1, i)
      const entry = findEntryForDate(date)

      days.push({
        date,
        isCurrentMonth: false,
        hasEntry: !!entry,
        emotion: entry?.emotion,
        entryId: entry?.id,
      })
    }

    // Add days from current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i)
      const entry = findEntryForDate(date)

      days.push({
        date,
        isCurrentMonth: true,
        hasEntry: !!entry,
        emotion: entry?.emotion,
        entryId: entry?.id,
      })
    }

    // Add days from next month
    for (let i = 1; i <= daysFromNextMonth; i++) {
      const date = new Date(year, month + 1, i)
      const entry = findEntryForDate(date)

      days.push({
        date,
        isCurrentMonth: false,
        hasEntry: !!entry,
        emotion: entry?.emotion,
        entryId: entry?.id,
      })
    }

    setCalendarDays(days)
  }

  // Find journal entry for a specific date
  const findEntryForDate = (date: Date): JournalEntry | undefined => {
    return journalEntries.find((entry) => {
      return (
        entry.date.getFullYear() === date.getFullYear() &&
        entry.date.getMonth() === date.getMonth() &&
        entry.date.getDate() === date.getDate()
      )
    })
  }

  // Navigate to previous month
  const goToPrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  // Navigate to next month
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  // Handle calendar day click
  const handleDayClick = (day: CalendarDay) => {
    if (day.hasEntry && day.entryId) {
      setSelectedEntryId(day.entryId);
    }
    // Set the selected day when a day is clicked
    setSelectedDay(day.date);
  };
  

  // // Simple emotion detection based on keywords
  // const detectEmotion = (text: string) => {
  //   const lowerText = text.toLowerCase()

  //   if (
  //     lowerText.includes("love") ||
  //     lowerText.includes("adore") ||
  //     lowerText.includes("cherish") ||
  //     lowerText.includes("heart")
  //   ) {
  //     setCurrentEmotion("love")
  //   } else if (
  //     lowerText.includes("pride") ||
  //     lowerText.includes("proud") ||
  //     lowerText.includes("accomplished") ||
  //     lowerText.includes("achievement")
  //   ) {
  //     setCurrentEmotion("pride")
  //   } else if (
  //     lowerText.includes("happy") ||
  //     lowerText.includes("joy") ||
  //     lowerText.includes("great") ||
  //     lowerText.includes("awesome")
  //   ) {
  //     setCurrentEmotion("happy")
  //   } else if (lowerText.includes("sad") || lowerText.includes("upset") || lowerText.includes("depressed")) {
  //     setCurrentEmotion("sad")
  //   } else if (lowerText.includes("angry") || lowerText.includes("mad") || lowerText.includes("frustrated")) {
  //     setCurrentEmotion("angry")
  //   } else if (lowerText.includes("excited") || lowerText.includes("thrilled") || lowerText.includes("amazing")) {
  //     setCurrentEmotion("excited")
  //   } else {
  //     setCurrentEmotion("neutral")
  //   }
  // }

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Reset state except transcript
      audioChunksRef.current = []
      setRecordingTime(0)

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      // Handle data available event
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Stop recording-related activities
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsRecording(false);
      }

      // Start recording
      mediaRecorder.start()

      // Start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start()
      }

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)

      setIsRecording(true)
    } catch (error) {
      console.error("Error starting recording:", error)
    }
  }

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()

      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())

      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      setIsRecording(false)
    }
  }

  // Format time for display
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Format date for display
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  // Format month for display
  const formatMonth = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date)
  }

  // Get animation properties based on emotion
  const getEmotionAnimationProps = (emotion: Emotion) => {
    switch (emotion) {
      case "love":
        return {
          backgroundColor: "bg-pink-50",
          circleColor: "bg-pink-300",
          squareColor: "bg-pink-400",
          triangleColor: "border-pink-500",
          animationSpeed: "animate-pulse",
          specialAnimation: "love-animation",
        }
      case "pride":
        return {
          backgroundColor: "bg-gradient-to-r from-red-50 via-yellow-50 to-violet-50",
          circleColor: "bg-gradient-to-r from-red-300 via-yellow-300 to-violet-300",
          squareColor: "bg-gradient-to-r from-orange-400 via-green-400 to-blue-400",
          triangleColor: "border-indigo-500",
          animationSpeed: "animate-bounce",
          specialAnimation: "pride-animation",
        }
      case "happy":
        return {
          backgroundColor: "bg-yellow-50",
          circleColor: "bg-yellow-300",
          squareColor: "bg-yellow-400",
          triangleColor: "border-yellow-500",
          animationSpeed: "animate-bounce",
        }
      case "sad":
        return {
          backgroundColor: "bg-blue-50",
          circleColor: "bg-blue-300",
          squareColor: "bg-blue-400",
          triangleColor: "border-blue-500",
          animationSpeed: "animate-pulse",
        }
      case "angry":
        return {
          backgroundColor: "bg-red-50",
          circleColor: "bg-red-300",
          squareColor: "bg-red-400",
          triangleColor: "border-red-500",
          animationSpeed: "animate-ping",
        }
      case "excited":
        return {
          backgroundColor: "bg-purple-50",
          circleColor: "bg-purple-300",
          squareColor: "bg-purple-400",
          triangleColor: "border-purple-500",
          animationSpeed: "animate-bounce",
        }
      default:
        return {
          backgroundColor: "bg-gray-50",
          circleColor: "bg-gray-300",
          squareColor: "bg-gray-400",
          triangleColor: "border-gray-500",
          animationSpeed: "animate-pulse",
        }
    }
  }

  // Get emotion label
  const getEmotionLabel = (emotion: Emotion) => {
    switch (emotion) {
      case "love":
        return "Love"
      case "pride":
        return "Pride"
      case "happy":
        return "Happy"
      case "sad":
        return "Sad"
      case "angry":
        return "Angry"
      case "excited":
        return "Excited"
      default:
        return "Neutral"
    }
  }

  // Get emotion color
  const getEmotionColor = (emotion: Emotion) => {
    switch (emotion) {
      case "love":
        return "text-pink-500"
      case "pride":
        return "text-indigo-500"
      case "happy":
        return "text-yellow-500"
      case "sad":
        return "text-blue-500"
      case "angry":
        return "text-red-500"
      case "excited":
        return "text-purple-500"
      default:
        return "text-gray-500"
    }
  }

  // Get affirmation based on emotion
  const getAffirmation = (emotion: Emotion) => {
    const affirmations = {
      love: [
        "Love is the most powerful force in the universe.",
        "Your capacity to love makes the world a better place.",
        "The love you give returns to you in unexpected ways.",
      ],
      pride: [
        "Be proud of who you are and all you've accomplished.",
        "Your uniqueness is your strength. Celebrate it!",
        "You have every right to stand tall and be proud of yourself.",
      ],
      happy: [
        "Your joy is contagious. Keep spreading it!",
        "Happiness looks beautiful on you.",
        "You deserve all the happiness you feel right now.",
      ],
      sad: [
        "It's okay to not be okay sometimes. Your feelings are valid.",
        "This too shall pass. Brighter days are ahead.",
        "You are stronger than you think, and you're not alone.",
      ],
      angry: [
        "Your feelings are valid. Take a deep breath.",
        "It's okay to feel angry. Release it in healthy ways.",
        "You have the power to transform this energy into something positive.",
      ],
      excited: [
        "Your enthusiasm lights up the room!",
        "Channel this energy into creating something amazing.",
        "Your excitement is the fuel for great achievements.",
      ],
      neutral: [
        "Today is full of possibilities.",
        "You are exactly where you need to be right now.",
        "Take a moment to appreciate the present.",
      ],
    }

    const emotionAffirmations = affirmations[emotion]
    const randomIndex = Math.floor(Math.random() * emotionAffirmations.length)
    return emotionAffirmations[randomIndex]
  }

  const emotionProps = getEmotionAnimationProps(currentEmotion)
  const selectedEntry = journalEntries.find((entry) => entry.id === selectedEntryId)

  
  // Generate image
  const generateImage = async () => {
    if (!transcript) return;
    
    setIsGeneratingImage(true);
    try {
      const response = await fetch('http://127.0.0.1:5000/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcript }),
      });

      if (!response.ok) throw new Error('Image generation failed');
      
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setGeneratedImage(imageUrl);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Generate music
  const generateMusic = async () => {
    if (!transcript) return;
    
    setIsGeneratingMusic(true);
    try {
      // Encode the transcript for URL parameters
      const encodedText = encodeURIComponent(transcript);
      const response = await fetch(`http://127.0.0.1:5000/music?text=${encodedText}`);

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          // Handle rate limit error
          console.error('Rate limit error:', errorData.error);
          // You could show this error to the user with a toast notification
          alert(errorData.error);
          return;
        }
        throw new Error(errorData.error || 'Music generation failed');
      }
      
      const data = await response.json();
      console.log('Audio URL:', data.audioUrl);
      setGeneratedMusic(data.audioUrl);
      
      // Create and play audio element
      const audio = new Audio(data.audioUrl);
      audio.play();
    } catch (error) {
      console.error('Error generating music:', error);
      alert('Failed to generate music. Please try again later.');
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  // Load entries on component mount
  useEffect(() => {
    loadEntries();
  }, []);

  // Function to load entries
  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:5000/get_entries');
      if (!response.ok) throw new Error('Failed to load entries');
      
      const entries = await response.json();
      setJournalEntries(entries.map((entry: any) => ({
        id: entry.id.toString(),
        date: new Date(entry.date),
        transcript: entry.transcript,
        emotion: entry.emotion as Emotion
      })));
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add this new function after other function declarations
  const handleSubmitEntry = async () => {
    if (!pendingEntry) return;
    
    try {
      // Create entry object without audio
      const newEntry = {
        date: (selectedDay || new Date()).toISOString(),
        // transcript: pendingEntry.transcript,
        transcript: transcript,
        // emotion: pendingEntry.emotion
        emotion: currentEmotion
      };

      const response = await fetch('http://127.0.0.1:5000/save_entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newEntry),
      });

      if (!response.ok) throw new Error('Failed to save entry');

      // Reload entries and reset states
      await loadEntries();
      setPendingEntry(null);
      setTranscript("");
      setCurrentEmotion("neutral");
      
    } catch (error) {
      console.error('Error saving entry:', error);
    }
  };

  return (
    <>
      {/* <BlobBackground emotion={currentEmotion} /> */}
      <div className={`min-h-screen flex flex-col ${emotionProps.backgroundColor} transition-colors duration-500`}>
        {/* Animated background */}
        <div className="fixed inset-0 -z-10 overflow-hidden">
          {/* Larger, more prominent shapes */}
          <div
            className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full ${emotionProps.circleColor} opacity-30 ${emotionProps.animationSpeed} transition-all duration-1000`}
          />
          <div
            className={`absolute top-2/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 ${emotionProps.squareColor} opacity-30 rotate-45 ${emotionProps.animationSpeed} delay-100 transition-all duration-1000`}
          />
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-l-[60px] border-r-[60px] border-b-[100px] ${emotionProps.triangleColor} border-l-transparent border-r-transparent opacity-30 ${emotionProps.animationSpeed} delay-200 transition-all duration-1000`}
          />

          {/* Additional background shapes */}
          <div
            className={`absolute top-1/4 left-1/4 w-32 h-32 rounded-full ${emotionProps.circleColor} opacity-20 ${emotionProps.animationSpeed} delay-300`}
          />
          <div
            className={`absolute bottom-1/4 right-1/4 w-40 h-40 rounded-full ${emotionProps.circleColor} opacity-20 ${emotionProps.animationSpeed} delay-150`}
          />
          <div
            className={`absolute top-1/3 right-1/3 w-24 h-24 ${emotionProps.squareColor} opacity-20 rotate-12 ${emotionProps.animationSpeed} delay-75`}
          />
          {currentEmotion === "love" && (
            <>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="love-heart"></div>
              </div>
              <div className="absolute top-1/4 left-1/3 love-heart scale-50 opacity-30"></div>
              <div className="absolute bottom-1/4 right-1/3 love-heart scale-75 opacity-40"></div>
            </>
          )}

          {/* Special animations for pride */}
          {currentEmotion === "pride" && <div className="pride-rainbow absolute inset-x-0 top-10 h-40 opacity-30"></div>}
        </div>

        <header className="p-4 border-b">
          <h1 className="text-2xl font-bold text-center">Voice Journal</h1>
        </header>

        <main className="flex-1 flex flex-col md:flex-row p-4 gap-4">
          {/* Left side - Recording controls */}
          <div className="w-full md:w-1/4 lg:w-1/5 flex flex-col items-center justify-start gap-6 p-4 bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="text-center mb-2">
              <h2 className="text-sm font-semibold mb-1">Record Journal</h2>
              <p className="text-xs text-muted-foreground">Press to start recording</p>
            </div>

            <div className="relative">
              <Button
                size="lg"
                className={`rounded-full w-16 h-16 ${isRecording ? "bg-red-500 hover:bg-red-600" : "bg-primary"}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>
              {isRecording && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </div>

            <div className="mt-2 text-center w-full">
              {isRecording && (
                <div className="flex items-center justify-center gap-1 text-red-500">
                  <Clock className="h-3 w-3" />
                  <span className="text-xs">{formatTime(recordingTime)}</span>
                </div>
              )}
              
              {/* Transcript box - now outside isRecording condition */}
              {transcript && (
                <div className="mt-2 p-2 border rounded-md max-w-md">
                  <p className="text-xs text-muted-foreground">Current transcript:</p>
                  <p className="mt-1 text-xs line-clamp-3">{transcript || "Speak to see your words here..."}</p>
                </div>
              )}
              
              {/* Emotion display - also show when there's a transcript */}
              {transcript && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Detected emotion:</p>
                  <p className={`text-xs font-medium ${getEmotionColor(currentEmotion)}`}>
                    {getEmotionLabel(currentEmotion)}
                  </p>
                </div>
              )}

              {transcript && !isRecording && (
                <div className="mt-4">
                  <Button 
                    onClick={handleSubmitEntry}
                    className="w-full"
                    disabled={!pendingEntry}
                  >
                    Submit Journal Entry
                  </Button>
                </div>
              )}
            </div>

            {/* Affirmation Box */}
            <Card className="w-full mt-4">
              <CardHeader className="pb-1 pt-3">
                <div className="flex items-center gap-1">
                  <Quote className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Affirmation</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="py-2">
                <div className="p-2 rounded-lg bg-primary/10 text-center">
                  <p className="italic text-xs">{getAffirmation(currentEmotion)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Image generation button */}
            {transcript && (
              <div className="w-full flex flex-col items-center gap-2">
                <Button 
                  onClick={generateImage}
                  disabled={isGeneratingImage}
                  className="flex items-center gap-2"
                >
                  <ImageIcon className="h-4 w-4" />
                  {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                </Button>
                
                {generatedImage && (
                  <div className="mt-2 w-full">
                    <img 
                      src={generatedImage} 
                      alt="Generated visualization"
                      className="w-full rounded-lg shadow-md" 
                    />
                  </div>
                )}
              </div>
            )}

            {/* Music generation button */}
            {transcript && (
              <div className="w-full flex flex-col items-center gap-2">
                <Button 
                  onClick={generateMusic}
                  disabled={isGeneratingMusic}
                  className="flex items-center gap-2"
                >
                  <Music className="h-4 w-4" />
                  {isGeneratingMusic ? 'Generating Music...' : 'Generate Music'}
                </Button>
                
                {generatedMusic && (
                  <div className="mt-2 w-full">
                    <audio 
                      controls
                      src={generatedMusic}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center area - Enhanced animations */}
          <div className="hidden md:flex flex-1 items-center justify-center relative">
            {/* Enhanced central animations will go here */}
            <div className="text-center p-6 rounded-lg bg-background/30 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-2">Your Emotional Journey</h2>
              <p className="text-muted-foreground mb-4">Speak to see your emotions visualized</p>
              <div className="relative h-64 w-64 mx-auto">
                {/* Enhanced emotion visualizations */}
                <div
                  className={`absolute inset-0 rounded-full ${emotionProps.circleColor} opacity-40 ${emotionProps.animationSpeed} transition-all duration-1000 ease-in-out`}
                ></div>
                <div
                  className={`absolute inset-8 rotate-45 ${emotionProps.squareColor} opacity-40 ${emotionProps.animationSpeed} delay-100 transition-all duration-1000 ease-in-out`}
                ></div>
                <div
                  className={`absolute inset-16 rounded-full ${emotionProps.circleColor} opacity-40 ${emotionProps.animationSpeed} delay-200 transition-all duration-1000 ease-in-out`}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-4xl font-bold ${getEmotionColor(currentEmotion)}`}>
                    {getEmotionLabel(currentEmotion)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Calendar and Journal log */}
          <div className="w-full md:w-1/4 lg:w-1/5 p-4 bg-background/80 backdrop-blur-sm rounded-lg">
            {/* Calendar */}
            <Card className="mb-4">
              <CardHeader className="pb-1 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Calendar
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToPrevMonth}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-medium">{formatMonth(currentMonth)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goToNextMonth}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 py-1">
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-0.5 text-xs">
                  {/* Day headers */}
                  {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                    <div key={day} className="text-center font-medium py-0.5">
                      {day}
                    </div>
                  ))}

                  {/* Calendar days */}
                  {calendarDays.map((day, index) => (
                    <div
                      key={index}
                      className={`
                          text-center p-0.5 rounded-sm cursor-pointer text-xs
                          ${day.isCurrentMonth ? "font-medium" : "text-muted-foreground"}
                          ${day.hasEntry ? getEmotionColor(day.emotion || "neutral") : "hover:bg-muted"}
                          ${selectedDay && day.date.toDateString() === selectedDay.toDateString() ? "ring-2 ring-primary" : ""}
              }
                        `}
                      onClick={() => handleDayClick(day)}
                    >
                      {day.date.getDate()}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Journal Entries */}
            <h2 className="text-sm font-semibold mb-2 mt-4">Journal Entries</h2>

            {journalEntries.length === 0 ? (
              <div className="text-center p-2 border rounded-md">
                <p className="text-xs text-muted-foreground">No entries yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto pr-1">
                {/* Selected entry */}
                {selectedEntry && (
                  <Card key={selectedEntry.id} className="border-primary">
                    <CardHeader className="pb-1 pt-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xs font-medium">{formatDate(selectedEntry.date)}</CardTitle>
                        <span className={`text-xs font-medium ${getEmotionColor(selectedEntry.emotion)}`}>
                          {getEmotionLabel(selectedEntry.emotion)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="py-1">
                      <p className="text-xs line-clamp-2">{selectedEntry.transcript}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Other entries */}
                {journalEntries
                  .filter((entry) => entry.id !== selectedEntryId)
                  .map((entry) => (
                    <Card
                      key={entry.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <CardHeader className="pb-1 pt-2">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-xs font-medium">{formatDate(entry.date)}</CardTitle>
                          <span className={`text-xs font-medium ${getEmotionColor(entry.emotion)}`}>
                            {getEmotionLabel(entry.emotion)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="py-1">
                        <p className="text-xs line-clamp-2">{entry.transcript}</p>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        </main>

        {/* Add this before the closing div */}
        {generatedImage && (
          <div style={imageContainerStyle}>
            <img 
              src={generatedImage} 
              alt="Generated visualization"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '4px'
              }}
            />
            <Button 
              variant="ghost" 
              size="sm" 
              className="absolute top-2 right-2"
              onClick={() => setGeneratedImage(null)}
            >
              ×
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

export {VoiceJournal}


