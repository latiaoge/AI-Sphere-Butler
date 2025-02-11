# AI Sphere Butler

## Introduction

### Open Source Project Plan
AI Sphere Butler aims to create a comprehensive AI butler for users' everyday lives—code name **“Xiao Li”** (the name of the butler can be customized).

**Project Name: AI Sphere Butler**

**Ultimate Vision**: Our goal is to create a comprehensive AI butler—“Xiao Li”—that provides an experience akin to a real butler in a video call. Apart from lacking a physical form, “Xiao Li” will possess capabilities such as thinking, emotional communication, visual and auditory perception, and simulated tactile feedback, all displayed across various devices in homes and vehicles. Its functions cover smart home control, emotional companionship, learning interaction, health management, security protection, personal shopping, outdoor navigation, and hotel booking.

To realize the ultimate vision of **"Xiao Li"**, we have decided to open this project to developers, researchers, and tech enthusiasts worldwide in an open-source manner, collectively building a highly intelligent, emotionally aware, and humanized digital assistant. We believe that through the power and wisdom of the global tech community, **"Xiao Li"** will become an indispensable companion in users' lives, providing more human-centered companionship and services.

Below are detailed explanations about the open-source plan and why it is worth your participation in building it together.

---

### **Why Choose Open Source?**

1. **Collective Intelligence and Rapid Iteration**:
   - Open source brings the power of community collaboration, allowing developers worldwide to contribute code, algorithms, designs, and ideas, accelerating the project's iteration and development.
   - By incorporating experiences and wisdom from various industries, **"Xiao Li"** can better adapt to the complex and diverse user needs and scenarios.

2. **Transparency and Trust**:
   - Open source makes the development process fully transparent, enabling users to understand how **"Xiao Li"** is built and operates. This transparency not only enhances user trust but also provides greater security and privacy protection for the project.

3. **Technological Inclusiveness**:
   - We hope to leverage open-source technology to lower barriers to entry, allowing more people to utilize the capabilities of **"Xiao Li"** in diverse scenarios such as education, healthcare, and social welfare.

4. **Global Influence**:
   - An open-source project is not just a technical collaboration; it's a process where developers worldwide pursue innovative goals together. Collaboratively building **"Xiao Li"** is not only a technological breakthrough but also an exploration of humanity's vision of an intelligent life.

---

### **Project Architecture and Planning**

To attract more participants, we need to clearly describe the project architecture to help developers quickly understand the core modules of the project and find suitable entry points for contribution.

#### **1. Modular Design of the Project**
Given the rich functionality of **"Xiao Li,"** we divided it into several core modules, each developed independently but capable of working together:

1. **Visual Interaction Module (Vision and Expressions)**:
   - Task: Create a highly realistic "virtual persona" that achieves dynamic facial expressions, natural motion simulation, and multi-device adaptability.
   - Tech Stack: Unity, Unreal Engine, 3D Modeling (Blender), OpenCV, MediaPipe.

2. **Voice Interaction Module (Hearing and Speech Synthesis)**:
   - Task: Build a high-precision speech recognition, natural language understanding (NLU), and human voice synthesis (TTS) system.
   - Tech Stack: Whisper, Coqui TTS, Vosk, Hugging Face Transformers.

3. **Emotional Computing and Psychological Support Module**:
   - Task: Understand user emotions through emotional analysis and provide appropriate psychological interactions or comfort.
   - Tech Stack: Emotional analysis models (BERT, RoBERTa), dialogue emotional recognition frameworks (OpenAI GPT, Rasa).

4. **Smart Home and IoT Module**:
   - Task: Support mainstream smart home protocols (such as Zigbee, Z-Wave, Matter) and device integration for real-time control and suggestions.
   - Tech Stack: MQTT, OpenHAB, Home Assistant.

5. **Learning and Knowledge Module**:
   - Task: Provide knowledge sharing and learning support services, including personalized recommendations and language learning assistants.
   - Tech Stack: Recommendation algorithms, NLP tools (spaCy, fastText), multilingual models (Google Translate API, DeepL).

6. **Health and Safety Module**:
   - Task: Combine health monitoring devices to provide health advice and emergency response services.
   - Tech Stack: Wearable device APIs (Apple HealthKit, Fitbit), edge computing, time-series data analysis (InfluxDB).

7. **Cross-Platform Compatibility Module**:
   - Task: Ensure **"Xiao Li"** can be presented on various terminals such as TVs, tablets, phones, and in-vehicle devices.
   - Tech Stack: React Native, Flutter, WebRTC.

---

## Development Plan

**1. Virtual Butler Module**

- Streaming dialogue digital person (currently using metahuman-stream)
  - Supports natural and fluent human-machine dialogue experience.
  - Provides virtual persona and voice cloning features for a more personalized digital assistant.

- Virtual Brain LLM/MM-Model or Multimodal Model (currently using fine-tuned Qwen2.5 LLM)
  - Endows the digital assistant with deeper understanding and response capabilities based on the fine-tuned Qwen2.5 large language model.
  - Supports custom local LLMs to meet specific needs.

- Wake-up Mode
  - Activates the system through specific keywords or phrases for convenient startup.

- Identity Recognition (Voiceprint Recognition, Facial Recognition)
  - Combines voiceprint and facial recognition technologies to ensure user security and personalized services.

- Support for Interruptions/Follow-up Questions
  - Allows users to ask questions or interrupt during conversations, enhancing interaction flexibility and naturalness.

- One-Click Voice and Persona Switching
  - Provides a simple operating interface for users to quickly change the digital assistant's voice and appearance.

**2. Voiceprint Recognition Module**
- Implements an efficient identity verification mechanism to enhance system security and user experience.

**3. Facial Recognition Module**
- Provides an additional layer of security and supports personalized user services.

**4. IoT Integration Module (using Home Assistant)**
- Uses the Home Assistant platform to manage and control all smart devices in the home, achieving seamless smart home integration.

**5. Online News Broadcasting Module**
- Retrieves the latest news in real-time and broadcasts important news to users in audio form.

**6. Interactive Haptic Feedback Module**
- Simulates real-world tactile sensations to enhance the realism of user interactions.

**7. Visual Module (Image Recognition and OCR)**
- Utilizes advanced image processing technologies for object recognition and text extraction, supporting various application scenarios.

**8. Real-Time Time Module**
- Provides accurate time display, helping users keep track of the current time.

**9. Real-Time Calendar Module**
- Detailed scheduling to facilitate users' daily activity planning.

**10. Event Reminder Module**
- Timely event reminders to ensure users don’t miss important matters.

**11. Weather Broadcasting Module**
- Provides detailed weather forecast information based on geographic location.

**12. Location Navigation Module**
- Supports map browsing, route planning, and other functions, facilitating users' travel arrangements.

**13. Music Playback Module**
- Integrates music playback functionality for a personalized music experience.

**14. Online Shopping Module**
- Provides convenient product searching, price comparison, and ordering services in one-stop shopping.

**15. Health Monitoring Module**
- Monitors users' health data, such as heart rate and sleep quality, and provides corresponding health advice.

**16. Security Module**
- Monitors home security status in real-time through cameras and issues alerts for abnormal situations.

**17. Butler Memory Module**
- Capable of remembering users' preferences, historical interactions, and emotional states to provide more personalized and considerate services, interacting as if with a familiar friend.

**18. Video Call Module**
- Supports high-definition video calls, maintaining close contact with family and friends.

**19. User Proxy Behavior Module**
- Can perform some daily tasks on behalf of users, such as answering phone calls and social interactions, greatly enhancing life efficiency.

**20. Emotion Recognition Module**
- Voice Tone Analysis
  - Tone Variation Detection: Analyzes the pitch, rhythm, and intensity of users' voice inputs to determine emotional states, such as happiness, sadness, anger, or calmness.
  - Contextual Reasoning: Considers the entire conversation context to capture users' emotional tendencies more accurately, rather than relying solely on individual words or sentences.

- Facial Expression Recognition
  - Real-Time Facial Tracking: Utilizes cameras to capture users' facial movements and analyzes facial expressions in real-time using deep learning algorithms, including smiles, furrows, eye movements, etc.
  - Emotion Classification: Automatically identifies various emotional categories such as happiness, surprise, confusion, anger, etc., based on facial muscle changes.

- Comprehensive Emotion Assessment
  - Multimodal Fusion: Combines data from voice tone and facial expressions for comprehensive analysis, providing a more holistic and accurate emotional assessment result.
  - Personalized Adjustment: Over time, “Xiao Li” will gradually learn and adapt to each user's unique expression style, enhancing the accuracy of emotion recognition.

---

## Current Development Progress

**1. Virtual Butler Module**
- Streaming dialogue digital person (currently using metahuman-stream)
- Virtual brain LLM/MM-Model or Multimodal Model (currently using fine-tuned Qwen2.5 LLM)
- Wake-up mode (not developed)
- Identity recognition (voiceprint recognition, facial recognition) (not developed)
- Support for interruptions/follow-up questions (not developed)
- One-click voice and persona switching (not developed)

**2. Voiceprint Recognition Module**
- (not developed)

**3. Facial Recognition Module**
- (not developed)

**4. IoT Integration Module (using Home Assistant)**
- Basic functionality has been successfully implemented.

**5. Online News Broadcasting Module**
- Basic functionality has been successfully implemented.

**6. Interactive Haptic Feedback Module**
- Basic functionality has been successfully implemented.

**7. Visual Module (Image Recognition and OCR)**
- Basic functionality has been successfully implemented.

**8. Real-Time Time Module**
- Basic functionality has been successfully implemented.

**9. Real-Time Calendar Module**
- Basic functionality has been successfully implemented.

**10. Event Reminder Module**
- Basic functionality has been successfully implemented.

**11. Weather Broadcasting Module**
- Basic functionality has been successfully implemented.

**12. Location Navigation Module**
- Basic functionality has been successfully implemented.

**13. Music Playback Module**
- (not developed)

**14. Online Shopping Module**
- (not developed)

**15. Health Monitoring Module**
- (not developed)

**16. Security Module**
- (not developed)

**17. Butler Memory Module**
- Basic functionality has been successfully implemented.

**18. Video Call Module**
- (not developed)

**19. User Proxy Behavior Module**
- (not developed)

**20. Emotion Recognition Module**
- (not developed)

---

## System Design Goals

1. **Modular Architecture**: Each functional module is developed independently and integrates with the core system through standardized interfaces to support future expansion and maintenance.
2. **Unified Management System**: Provides a centralized interface for users to intuitively manage and operate all functional modules.
3. **High Expandability and Flexibility**: Supports future functional expansions, such as the physical robot control module and wireless brain-computer interaction module.
4. **User-Friendliness**: Offers convenient interaction methods to simplify the use of complex functionalities.
5. **Data Privacy and Security**: Ensures the security of user data during collection, processing, and storage, complying with privacy protection regulations.

---

## System Architecture Design

### **1. Technical Architecture**
The system adopts a **microservices architecture**, where each module runs as an independent service, and the core management system is responsible for scheduling and management:

#### **1.1 Frontend**
- **Framework**: React.js or Vue.js
- **UI Component Library**: Ant Design, Material UI
- **Functions**:
  - Dashboard interface displaying the status and entry points of all modules.
  - Interactive module management page supporting user customization.
  - Real-time data display (e.g., health monitoring data, emotion analysis results).

#### **1.2 Backend**
- **Main Framework**: Python (Django or FastAPI) / Node.js
- **Database**: PostgreSQL (structured data) + MongoDB (unstructured data)
- **Message Queue**: Kafka or RabbitMQ for asynchronous communication between modules.
- **Interface Protocol**: REST API or GraphQL providing a unified module interface.

#### **1.3 Module Communication**
- **Message Passing**: Real-time communication between modules via MQTT or WebSocket.
- **Module Registration**: Each module dynamically registers with the core system upon startup for status monitoring and invocation.

#### **1.4 Deployment**
- **Containerization**: Manages module deployment and scaling through Docker and Kubernetes.
- **Cloud Services**: Supports AWS, Azure, or Alibaba Cloud, and can also be deployed locally (especially for privacy-related functionalities).

---

### **2. System Function Module Management**

#### **2.1 Core Management System**
- **Main Functions**:
  - **Module Registration and Status Management**: Dynamically monitors the operating status of modules (online/offline, performance data).
  - **Task Scheduling**: Invokes corresponding modules based on user requests (e.g., triggering smart home control via voice commands).
  - **User Management**: Supports multiple user identity recognition and personalized preference settings.
  - **Logging and Auditing**: Records module operation logs and user actions for troubleshooting.

#### **2.2 Module Communication Design**
- **Requests and Responses**:
  - User interactions send requests through the core management system.
  - After the modules return results, the core management system integrates and presents them to the user.
- **Asynchronous Task Processing**:
  - Complex tasks (e.g., image recognition, emotion analysis) are handled through asynchronous message queues to avoid blocking user operations.

---

### **3. Functional Module Implementation Solutions**

Below are the design and implementation solutions for the main modules:

#### **3.1 Virtual Butler Module**
- **Technology**:
  - Dialogue: Provides multi-turn dialogue capabilities based on the fine-tuned Qwen2.5 LLM.
  - Virtual Persona: Implements virtual character appearance using LiveTalking or Unity3D.
  - Voice Cloning: Integrates Coqui TTS or similar technologies for personalized voice.
- **Functions**:
  - Streaming Dialogue: Supports real-time voice/text interaction.
  - Wake-Up Mode: Activates via keywords (e.g., “Hello, Xiao Li”).
  - One-Click Persona Switching: Provides a customizable interface for quickly changing the virtual persona's appearance and voice.

#### **3.2 Voiceprint and Facial Recognition Module**
- **Technology**:
  - Voiceprint Recognition: Uses Speaker Verification models (like ResNet).
  - Facial Recognition: Based on Dlib or FaceNet implementations.
- **Functions**:
  - Identity Verification: Ensures secure user login and personalized services.
  - Multi-User Support: Loads exclusive settings for different users upon login.

#### **3.3 IoT Integration Module**
- **Technology**:
  - Integrates smart home devices via Home Assistant and its API.
- **Functions**:
  - Device Management: Supports control of devices like lights and air conditioning.
  - Automation Rules: Users can set triggers (e.g., "Turn off the lights at night").

#### **3.4 Emotion Recognition Module**
- **Technology**:
  - Voice Analysis: Based on Transformer models (like Wav2Vec).
  - Expression Recognition: Analyzes facial expressions using OpenCV or deep learning frameworks.
  - Multimodal Fusion: Combines voice and image data using TensorFlow or PyTorch for analysis.
- **Functions**:
  - Real-time Emotion Monitoring: Captures changes in user emotions and adjusts services accordingly.
  - User Learning: Improves emotional recognition accuracy based on historical interactions.

#### **3.5 Health Monitoring Module**
- **Technology**:
  - Data Collection: Interfaces with wearable APIs (like Fitbit, Apple HealthKit).
  - Data Analysis: Uses time-series data storage and trend analysis (like InfluxDB).
- **Functions**:
  - Real-Time Health Monitoring: Provides data on heart rate, sleep, etc.
  - Health Recommendations: Generates personalized advice based on monitoring data.

#### **3.6 Video Call Module**
- **Technology**:
  - Implements low-latency video calls using WebRTC.
- **Functions**:
  - Supports multi-party calls and real-time screen sharing.

---

### **4. Management Interface Design**

#### **4.1 Interface Layout**
- **Top Navigation Bar**:
  - Quick Access: Such as voice input and search box.
  - System Status: Displays the current number of online modules and health status.
- **Left Sidebar**:
  - Module Category Navigation (e.g., “Virtual Butler,” “Smart Home,” “Health Monitoring”).
- **Main Workspace**:
  - Dashboard style displaying the real-time status of modules and quick operation buttons.
  - Clicking on module cards leads to detailed interfaces (e.g., health monitoring data charts).
- **Bottom Status Bar**:
  - Displays system logs and real-time message notifications.

#### **4.2 User Interaction**
- **Module Control**: Users quickly enable/disable modules through a card-based interface.
- **Real-Time Feedback**: Module status (such as online/offline) and task progress are updated in real-time.

---

### **5. System Security Design**
- **Data Encryption**: User data is encrypted during storage and transmission (using AES or TLS).
- **Permission Management**: Controls module access permissions based on user roles.
- **Privacy Protection**: Supports data anonymization and local storage to ensure privacy security.

---

### **Future Extensions**
1. **Physical Robot Control Module**:
   - **Remote Control**: Provides a robot control interface via the core system.
   - **Task Scheduling**: Supports scheduled automated tasks (e.g., cleaning, patrolling).
2. **Wireless Brain-Computer Interaction Module**:
   - **Brain Signal Input**: Develops EEG device interfaces.
   - **Advanced Interaction**: Supports thought navigation and simple commands (e.g., turn on the lights, play music).

---

### **Development Plan**
#### **Phase 1: Core Framework Setup**
- Develop the core management system to support module registration and scheduling.
- Implement the basic functionalities of the virtual butler module and IoT integration module.

#### **Phase 2: Functional Module Integration**
- Integrate functionalities such as emotion recognition and health monitoring.
- Optimize user management and permission control.

#### **Phase 3: Expansion and Optimization**
- Add future functionalities (such as physical robot control and wireless brain-computer interaction).
- Iteratively optimize the performance of emotion recognition and LLM models.

---

## Project Structure

ai-sphere-butler/  # Project root directory
├── docs/                  # Project documentation
│   ├── README.md             # Project introduction and quick start guide (Markdown format)
│   ├── architecture.md      # System architecture design document (Markdown format)
│   ├── api.md               # API documentation (Markdown format)
│   ├── contributing.md      # Contribution guide (Markdown format)
│   ├── installation.md      # Installation instructions (Markdown format)
│   ├── usage.md             # Usage instructions (Markdown format)
│   ├── faq.md               # Frequently Asked Questions (Markdown format)
│   ├── license.md           # Open source license information (Markdown format)
│   └── code_of_conduct.md   # Code of conduct (Markdown format)
├── core/                    # Core management system
│   ├── server/              # Backend services
│   │   ├── main.py         # Main program entry (Python)
│   │   ├── config/
│   │   │   ├── settings.py  # Backend configuration file (Python)
│   │   │   ├── logging.conf # Logging configuration file
│   │   │   └── database.ini # Database connection information
│   │   ├── modules/         # Implementations of various functional modules
│   │   │   ├── user_manager/
│   │   │   │   ├── __init__.py        # Python package initialization file
│   │   │   │   ├── models.py        # Database models (Python)
│   │   │   │   ├── routes.py        # API routing (Python)
│   │   │   │   └── services.py       # Business logic (Python)
│   │   │   ├── dialog_manager/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── nlp.py           # Natural language processing (Python)
│   │   │   │   ├── context.py       # Dialogue context management (Python)
│   │   │   │   └── routes.py
│   │   │   ├── emotion_engine/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── models.py
│   │   │   │   └── analyzer.py      # Emotion analysis (Python)
│   │   │   ├── skill_platform/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── registry.py      # Skill registration (Python)
│   │   │   │   └── skills/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── smart_home.py  # Smart home skill (Python)
│   │   │   │       ├── weather.py     # Weather skill (Python)
│   │   │   │       └── ...            # Other skills
│   │   │   ├── device_manager/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── controllers.py   # Device control (Python)
│   │   │   │   └── discovery.py     # Device discovery (Python)
│   │   │   ├── data_analysis/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── analytics.py     # Data analysis (Python)
│   │   │   │   └── reporting.py    # Data reporting generation (Python)
│   │   │   ├── security_manager/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── authentication.py # Identity verification (Python)
│   │   │   │   └── authorization.py  # Permission management (Python)
│   │   │   └── ...                 # Other modules
│   │   ├── api/                 # API interface definitions
│   │   │   ├── user.py           # User API (Python)
│   │   │   ├── device.py         # Device API (Python)
│   │   │   ├── skill.py          # Skill API (Python)
│   │   │   └── ...
│   │   ├── utils/                # Utility functions and helper classes
│   │   │   ├── __init__.py
│   │   │   ├── logging.py        # Logging utility class (Python)
│   │   │   ├── database.py       # Database utility class (Python)
│   │   │   └── ...
│   │   └── tests/               # Backend tests
│   │       ├── __init__.py
│   │       ├── test_user_manager.py # User management module tests (Python)
│   │       └── ...
│   ├── client/              # Frontend client
│   │   ├── public/          # Static resources
│   │   │   ├── index.html    # Main HTML file
│   │   │   └── ...
│   │   ├── src/            # Source code
│   │   │   ├── components/  # Components
│   │   │   │   ├── Header.js    # Header component (JavaScript/React)
│   │   │   │   ├── Sidebar.js   # Sidebar component (JavaScript/React)
│   │   │   │   ├── Dashboard.js # Dashboard component (JavaScript/React)
│   │   │   │   ├── SkillCard.js # Skill card component (JavaScript/React)
│   │   │   │   └── ...
│   │   │   ├── pages/       # Pages
│   │   │   │   ├── Home.js      # Home page (JavaScript/React)
│   │   │   │   ├── Settings.js  # Settings page (JavaScript/React)
│   │   │   │   └── ...
│   │   │   ├── services/    # Services
│   │   │   │   ├── api.js      # API service (JavaScript)
│   │   │   │   ├── auth.js     # Authentication service (JavaScript)
│   │   │   │   └── ...
│   │   │   ├── App.js           # Application entry (JavaScript/React)
│   │   │   ├── index.js         # Entry file (JavaScript/React)
│   │   │   ├── styles.css       # Stylesheet (CSS)
│   │   │   └── ...
│   │   └── package.json     # Frontend dependency management
│   └── ...
├── modules/                # Optional independent modules (can be added or removed as needed)
│   ├── iot_control/       # IoT control module (example)
│   │   ├── __init__.py
│   │   ├── config.yaml     # Module configuration file (YAML)
│   │   ├── handlers.py    # Event handling (Python)
│   │   └── ...
│   └── ...                 # Other modules
├── models/                  # AI model data
│   ├── qwen-2.5/           # Pre-trained language model
│   ├── emotion_recognition/  # Emotion recognition model
│   └── ...
├── data/                    # Data storage
│   ├── user_data/          # User data
│   ├── device_data/        # Device data
│   └── ...
├── scripts/                 # Script tools
│   ├── setup.sh            # Installation script (Shell)
│   ├── run.sh              # Run script (Shell)
│   └── ...
├── tests/                   # Test code
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── ...
├── .gitignore               # Git ignore file list
├── LICENSE                  # Open source license file
├── requirements.txt         # Python dependency package list
└── setup.py                 # Python project installation file

Runtime Flow Diagram

    Startup Process
        Main program entry (core/server/main.py):
            Load configuration file (core/server/config/settings.py)
            Initialize logging (core/server/config/logging.conf)
            Connect to the database (core/server/config/database.ini)
            Start Flask or Django web framework server
            Load all necessary modules and services (e.g., user management, dialogue management)

    User Interaction Flow
        Frontend Client (core/client/src/)
            Static Resources (public/index.html):
                Main HTML file that loads the React application and other static resources
            Source Code (src/):
                Components (components/)
                Pages (pages/)
                Services (services/)
                Entry files (App.js, index.js)
                Stylesheet (styles.css)
                Frontend dependency management (package.json)

    Backend Services (core/server/)
        API Interface Definitions (core/server/api/)
            user.py: User-related API
            device.py: Device-related API
            skill.py: Skill-related API

    Data Flow
        Database (core/server/config/database.ini)
            Stores user information, device status, historical interaction records, etc.
            Uses ORM frameworks (like SQLAlchemy) for database operations (core/server/utils/database.py)
        AI Models (models/qwen-2.5/, emotion_recognition/)
            Loads pre-trained language models and emotion recognition models
            Uses these models for inference in dialogue management and emotion analysis

    Testing and Maintenance
        Unit Tests (core/server/tests/)
        Integration Tests (tests/integration/)
        Deployment and Operations (scripts/setup.sh, run.sh)

Conclusion

We invite you to join the AI Sphere Butler open-source project and work together to build an intelligent, emotional digital assistant. Whether you are a developer, designer, or tech enthusiast, your participation will bring new possibilities to "Xiao Li."

For more information, feel free to visit our GitHub (replace with the actual link) for the latest updates or engage in discussions in our discussion area.

Thank you for your attention and support!