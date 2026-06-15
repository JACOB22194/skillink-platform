# Skilllink Platform — Monorepo

Welcome to the **Skilllink Platform** repository. Skilllink is a modern, AI-powered freelance marketplace designed to connect clients with freelancers, featuring automated escrow workflows, milestone-based payments, and AI-driven skill matching.

* **GitHub Repository Link**: [https://github.com/JACOB22194/skillink-platform.git](https://github.com/JACOB22194/skillink-platform.git)

---

## 1. Project Overview

Skilllink is a full-stack web application designed with a microservices architecture. It consists of the following core components:
1. **Frontend**: A highly responsive user interface built using **Vite + React + TypeScript + Tailwind CSS v4**.
2. **Backend API**: A high-performance REST API built using **FastAPI**, with **SQLAlchemy ORM** connected to a **PostgreSQL** database (including a database replica and a backup service).
3. **AI Recommender Service**: A specialized microservice built using **FastAPI + PyTorch + Scikit-Learn** that classifies user profiles, parses skills, and recommends tailored courses and jobs.
4. **Nginx Reverse Proxy**: Directs traffic dynamically between the Frontend, Backend, and AI services.

---

## 2. Software & Unit Test Folder Mapping

To align with the project criteria, the table below maps the required **Software Implementation** and **Unit Test** components to their physical paths in this repository:

| Required Component | Project Folder / Subdirectory | Purpose & Description |
| :--- | :--- | :--- |
| **Software Implementation (Frontend)** | [Skilllink-Frontend](file:///d:/Skilllink/Skilllink-Frontend) | React UI, routing, state management, and escrow client workflows. |
| **Software Implementation (Backend)** | [Skilllink-backend](file:///d:/Skilllink/Skilllink-backend) | Core API, database models, payment/escrow logic, and authentication. |
| **Software Implementation (AI)** | [Skillink-AI](file:///d:/Skilllink/Skillink-AI) | Machine learning recommender model, endpoints, and data processing. |
| **Unit Test Implementation (Frontend)** | [Skilllink-Frontend/src/tests](file:///d:/Skilllink/Skilllink-Frontend/src) | Vitest unit and component tests for React components. |
| **Unit Test Implementation (Backend)** | [Skilllink-backend/tests](file:///d:/Skilllink/Skilllink-backend/tests) | Pytest API, database integration, and auth unit tests. |
| **Unit Test Implementation (AI)** | [Skillink-AI/tests](file:///d:/Skilllink/Skillink-AI/tests) | Pytest unit tests verifying ML classification and recommendations. |

---

## 3. Dataset Description & Access Instructions

The AI recommendation service utilizes the following datasets to train models and serve predictions:

* **Coursera Courses Dataset (`courses_clean.csv`)**:
  * **Path**: [Skillink-AI/skillink_model/courses_clean.csv](file:///d:/Skilllink/Skillink-AI/skillink_model/courses_clean.csv)
  * **Description**: Contains cleaned course data (names, difficulties, ratings, links, categories, and tags) from Coursera, used by the recommender to suggest learning resources based on a freelancer's skill gaps.
* **IT Skill Taxonomy (`it_skill_taxonomy.json`)**:
  * **Path**: [Skillink-AI/skillink_model/it_skill_taxonomy.json](file:///d:/Skilllink/Skillink-AI/skillink_model/it_skill_taxonomy.json)
  * **Description**: A comprehensive taxonomy of IT skills used to map user inputs to canonical skill names.
* **Pre-trained ML Models**:
  * **Path**: [Skillink-AI/skillink_model/](file:///d:/Skilllink/Skillink-AI/skillink_model/)
  * Contains pre-trained Scikit-Learn classifiers (`lr_model.joblib`, `svc_sub.joblib`) and TF-IDF encoders (`tfidf.joblib`) for predicting skill subcategories.
  * You can retrain these models locally using [train_clf_beginner.py](file:///d:/Skilllink/Skillink-AI/skillink_model/train_clf_beginner.py) and [train_pricing_model.py](file:///d:/Skilllink/Skillink-AI/skillink_model/train_pricing_model.py).

---

## 4. Environment Setup & Installation

### Prerequisites
Ensure you have the following installed on your machine:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/)
* [Python 3.10+](https://www.python.org/downloads/) (for running tests/services locally)
* [Node.js 18+](https://nodejs.org/) (for running the frontend locally)


---


## 5. How to Run the Code

The simplest way to run the entire stack is via **Docker Compose**:

1. **Build and start the application containers**:
   ```bash
   docker compose up -d --build
   ```
2. **Verify running containers**:
   ```bash
   docker compose ps
   ```
3. **Access the application**:
   * **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   * **Backend API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   * **AI Service Health**: [http://localhost:8001/health](http://localhost:8001/health)

---

## 6. How to Run the Unit Tests

Each service has its own dedicated test suite. You can run them locally as follows:

### Running Frontend Tests (Vitest)
```bash
cd Skilllink-Frontend
npm install
npm run test
```

### Running Backend Tests (Pytest)
```bash
cd Skilllink-backend
python -m venv venv
# Activate virtual environment:
# Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
pytest
```

### Running AI Service Tests (Pytest)
```bash
cd Skillink-AI
python -m venv venv
# Activate virtual environment:
# Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
pytest
```
