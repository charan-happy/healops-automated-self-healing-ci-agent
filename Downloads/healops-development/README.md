
# 👨‍✈️ HealOps

For code reference of my working solution you can [refer here](https://github.com/charan-happy/red2green.git)

>Autonomous CI/CD First Responder 

>  Detect. Diagnose. Fix. Validate. Submit.

HealOps is an AI-driven agent that automatically resolves routine CI/CD failures by generating validated pull requests — without interrupting developers.

It reduces Mean Time To Recovery (MTTR) from hours to minutes by closing the automation gap in modern software delivery pipelines.

---

## 📌 Table of Contents

- [The Problem](#-the-problem)
- [The Solution](#-the-solution)
- [How It Works](#-how-it-works)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [Security Model](#-security-model)
- [Reliability Strategy](#-reliability-strategy)
- [Performance & Impact](#-performance--impact)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

# 🚨 The Problem

Engineering teams spend **15–25% of their time** resolving CI/CD failures.

Most failures fall into predictable categories:

- Syntax errors  
- Lint violations  
- Dependency conflicts  
- Type errors  
- Broken imports  
- Misconfigured environments  
- Minor test regressions  

Approximately **80% of these issues are algorithmically fixable**, yet they require manual intervention — disrupting developer focus and slowing releases.

---

# 🚀 The Solution

HealOps acts as a 24/7 automated CI/CD responder.

When a pipeline fails, HealOps:

1. Detects the failure via webhook
2. Classifies the failure type
3. Generates a patch using a local LLM
4. Validates the fix in a Docker sandbox
5. Retries intelligently using a state machine
6. Submits a pull request if successful
7. Escalates with detailed diagnostics if not

Developers wake up to fixed builds — not broken ones.

---

# 🔁 How It Works

HealOps follows a structured self-healing loop:



`Detect → Diagnose → Generate → Validate → Retry → Escalate`

Unlike naive AI tools, HealOps:

- Uses structured failure classification
- Maintains state between retries
- Incorporates previous error logs
- Verifies every patch before submission
- Escalates safely after retry limits

This ensures deterministic behavior instead of blind prompt looping.

---

# 🏗 Architecture


```
┌──────────────────────────────┐
│ CI/CD Provider │
│ (GitHub / GitLab / etc.) │
└───────────────┬──────────────┘
│ Webhook
▼
┌──────────────────────────────┐
│ HealOps API │
│ (NestJS) │
└───────────────┬──────────────┘
▼
┌──────────────────────────────┐
│ LLM Engine │
│ (Llama 3.1 via Ollama) │
└───────────────┬──────────────┘
▼
┌──────────────────────────────┐
│ Docker Sandbox │
│ (Isolated Validation Env) │
└───────────────┬──────────────┘
▼
┌──────────────────────────────┐
│ SCM Adapter │
│ (PR / Issue Creation) │
└──────────────────────────────┘
```


---

# ✨ Features

### Autonomous Monitoring
Real-time CI failure detection via webhook integrations.

### Intelligent Diagnosis
Classifies failures across multiple categories for targeted patch generation.

### Deterministic Retry Logic
State-machine-driven retry strategy using XState.

### Sandboxed Validation
All patches are tested in isolated Docker containers before submission.

### Safe Escalation
Creates structured GitHub Issues if retries exceed threshold.

### Provider-Agnostic Design
Adapter pattern enables support for multiple CI/CD and SCM systems.

---

# 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| LLM | Llama 3.1 (Ollama, local execution) |
| Agent Orchestration | LangGraph |
| Backend | NestJS |
| Frontend | Next.js + Tailwind CSS |
| Sandbox | Docker |
| Database | SQLite + Prisma |
| State Management | XState |
| Monorepo | Nx |
| Integrations | Adapter Pattern (CI & SCM) |

---

# 📁 Project Structure


```
/
├── apps/
│ ├── api/ # NestJS backend
│ └── web/ # Next.js dashboard
│
├── libs/
│ ├── adapters/ # CI and SCM integrations
│ ├── llm/ # LLM integration layer
│ ├── sandbox/ # Docker validation logic
│ ├── state-machine/ # XState retry engine
│ ├── shared/ # Shared types and DTOs
│ └── database/ # Prisma schema & migrations
│
├── docs/
├── tools/
└── package.json
```

# 🚀 Getting Started

## Prerequisites

- Node.js 18+
- Docker Desktop
- Ollama installed
- Llama 3.1 pulled locally

```bash
ollama pull llama3.1

### Installation
```
git clone https://github.com/your-team/healops.git
cd healops
npm install
npx prisma migrate dev
```


### start service

```
# Start Ollama
ollama serve

# Start API
npm run start:api

# Start Web UI
npm run start:web
```




## ⚙️ Configuration

1. Configure your CI provider webhook:
`POST http://localhost:3000/webhook`

2. Set required environmental variables
```
DATABASE_URL=
GITHUB_TOKEN=
OLLAMA_BASE_URL=
MAX_RETRIES=3
```

3. Ensure Docker daemon is running.



## 🔐 Security Model

All patch validation occurs inside isolated Docker containers

No direct execution on host filesystem

Strict input sanitization

Controlled workspace mounting

Retry limits prevent infinite loops

Escalation instead of forced fixes

HealOps prioritizes safety over aggressive automation.


## Performance and impact

| Metric                      | Without HealOps | With HealOps |
| --------------------------- | ------------------ | --------------- |
| MTTR                        | 30–60 min          | ~3 min          |
| Cost per Incident           | ~$150              | ~$0             |
| Developer Context Switching | High               | Minimal         |
| Night-Time Failures         | Block releases     | Auto-resolved   |



## 🧪 Reliability Strategy

Structured failure taxonomy

Deterministic retry state machine

Feedback-aware prompt chaining

Validation before PR creation

Observability & structured logs

Safe fallback escalation











## 🗺 Roadmap

GitLab & Bitbucket support

Plugin-based adapter architecture

Multi-repository orchestration

Metrics dashboard (success rate, MTTR)

Strategy A/B testing for fix generation

Larger model support (Llama 70B)

Queue-based concurrency control

Persistent learning layer



## 🤝 Contributing

Contributions are welcome.

Fork the repository

Create a feature branch

Commit changes

Submit a pull request

Please ensure:

Tests pass

Code follows existing architecture patterns

New adapters follow the adapter interface contract
