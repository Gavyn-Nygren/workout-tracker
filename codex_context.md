1. Technology Stack

Frontend (Client): React Native, Expo (Managed Workflow), React Native Web.

State & Storage: TanStack Query (React Query) for data fetching, React Native MMKV for offline-first local caching.

Edge AI (On-Device): react-native-vision-camera for frame capture, Google MediaPipe (Pose Landmarker) for 33-point spatial tracking, and @shopify/react-native-skia for 60fps graphics overlay.

Backend (Server): Python 3.13, Flask, SQLAlchemy (ORM), JWT + Bcrypt for authentication.

Database & AI Cloud: PostgreSQL with pgvector extension for vector embeddings, LangChain for AI orchestration, and OpenAI/Google Gemini for the LLM provider.

2. Repository Structure (Monorepo)
The project uses a monorepo structure. All terminal commands for the frontend must be executed in the client/ directory, and all backend commands in the server/ directory using the virtual environment.

Plaintext
ai-workout-tracker/
├── client/                 (Expo / React Native)
├── server/                 (Flask / Python)
│   ├── venv/
│   ├── app.py
│   └── requirements.txt
3. UI/UX Design System (Light Mode)
The app utilizes a high-energy, athletic "sandwich" design paradigm to maintain a premium gym aesthetic even in light mode:

Headers & Navigation: Both the top header (e.g., MONDAY: LEG DAY) and the bottom tab navigation bar (#111827 or similar dark gray/black) remain in dark mode at all times.

Bottom Tab Icons: Inactive icons are medium gray (#6B7280).

Primary Accent Color: A sleek "baby blue" (hex roughly #73C2FB or similar cool blue). This is used for primary CTA buttons (like "START WORKOUT") and the active icon in the bottom navigation bar.

Typography: Text on white backgrounds (like "Today's Workout" or active calendar dates) must be black or dark gray (#111827) for strict accessibility and contrast compliance.

Exercise Cards: Utilize a black-to-white horizontal gradient background with white text on the dark side, transitioning cleanly to the white background.

Z-Index/Scrolling: The primary CTA button sits above the scroll view with a pure white-to-transparent linear gradient behind it to create a smooth floating effect over the exercise cards.

4. Edge AI & Vision Calibration Context
When building the mathematical worklets for the MediaPipe pose landmarker (specifically calculating joint angles for squat depth or wingspan tracking), baseline default test profiles should be configured around a 5'10" height, a 6-foot wingspan, a 34-inch inseam, and a 40-inch chest to ensure the aspect ratio scaling and distance calculations map accurately to an athletic build before generalizing to other body types. The AI assistant should also be heavily primed for an active lifestyle, referencing activities like club soccer and outdoor sports when generating contextual fitness advice.

5. Implementation Reference
When generating specific API routes or database models, ensure they strictly adhere to the full architectural implementation specification document generated in June 2026.

Prompt for Codex:

"Review the context document above. Acknowledge that you understand the tech stack, the UI/UX design constraints, and the monorepo structure. Are you ready to begin generating the code for the active workout session screen or the initial Flask API routes?"