# AI-Powered Workout Tracker

> **Status:** early development. This overview predates the current plan. The source of truth is [exercise-tracker-draft.md](exercise-tracker-draft.md) (product spec) and [ROADMAP.md](ROADMAP.md) (build order). Key changes since this README was written:
> - The launch is iOS first; Android and web come later.
> - The client uses Expo SDK 58 with custom development builds (not the managed workflow alone).
> - Supabase Auth replaces the hand-built JWT + bcrypt plan.
> - SQLite replaces MMKV as the offline store.
> - The AI chat ships in a follow-up release.

A cross-platform (Mobile + Web) workout tracking application featuring real-time, on-device AI exercise form analysis and a LangChain-powered conversational assistant for contextual workout insights. 

## 🚀 Features

*   **Real-Time Form Tracking:** Utilizes on-device computer vision to track 33 spatial body landmarks, calculating joint angles (e.g., squat depth) frame-by-frame with zero latency.
*   **Conversational AI Assistant:** A Retrieval-Augmented Generation (RAG) chatbot that searches your historical workout logs to provide contextual, personalized fitness insights.
*   **Hardware-Accelerated Analytics:** Smooth, 60fps time-series charting to visualize volume, estimated 1RM, and progression over time.
*   **Offline-First Mobile Experience:** Workouts are cached locally on the device to ensure no data is lost when gym Wi-Fi drops, automatically syncing when reconnected.
*   **Unified Codebase:** Built for iOS, Android, and Web from a single React Native repository.

## 🛠 Technology Stack

**Frontend & Client (Cross-Platform)**
*   **Framework:** React Native + Expo (Managed Workflow), React Native Web
*   **State & Fetching:** TanStack Query (React Query)
*   **Storage:** React Native MMKV
*   **Data Visualization:** Victory Native XL

**Edge AI & Computer Vision (Mobile)**
*   **Camera Infrastructure:** react-native-vision-camera
*   **Pose Estimation:** Google MediaPipe (Pose Landmarker)
*   **Graphics Overlay:** @shopify/react-native-skia

**Backend & API**
*   **Framework:** Python / Flask
*   **Authentication:** JWT + Bcrypt
*   **ORM:** SQLAlchemy

**Database & Cloud AI**
*   **Database:** PostgreSQL
*   **Vector Engine:** pgvector
*   **AI Orchestration:** LangChain
*   **LLM Provider:** OpenAI / Google Gemini

## 📁 Repository Structure

This project is structured as a monorepo containing both the React Native client and the Python backend.

```text
ai-workout-tracker/
├── client/                 # React Native / Expo frontend code
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── screens/        # Main application screens (Home, Active Session, Insights)
│   │   └── utils/          # AI math worklets and helpers
│   ├── package.json
│   └── app.json
├── server/                 # Python / Flask backend API
│   ├── app/
│   │   ├── routes/         # API endpoints
│   │   ├── models/         # SQLAlchemy database models
│   │   └── services/       # LangChain and pgvector logic
│   ├── requirements.txt
│   └── .env.example
├── .gitignore
└── README.md
