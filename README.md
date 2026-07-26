# 🐢 HopeTurtles.org

The **Hope Turtle Project** is developing and deploying regenerative, non-violent, humanitarian technology to deliver food, love and hope to +-5k coastal areas. Our technology is designed from the ground up to be human, ocean, animal and ecosystem friendly by following Earthen principles.  Best of all, we've designed hope turtles to use nothing but easy to find parts and components and open source code, so that anyone anywhere can take action today to deliver light and love to our fellow humans who need it most, with minimal harm and maximum blessing to our fellow creatures. 

See the turtleOS repository for the device code for our turtles.

---

## 🌍 Platform Overview

The web app enables:
- **Mission Planning:** Define launch hubs, missions, and destinations.
- **Turtle Tracking:** View real-time telemetry updates from GPS-enabled Hope Turtles.
- **Bottle Registry:** Manage individual bottles carried within each turtle.
- **Success Logging:** When turtles or bottles are found, users can log photos and thank-you messages.
- **Buwana Authentication:** Shared identity system across regenerative Earthen apps (GoBrik, EarthCal, etc.).

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-------------|
| Backend | Node.js (Express.js) |
| Database | MySQL |
| Frontend | EJS + TailwindCSS |
| Real-Time | Socket.io |
| Auth | Buwana Unified Login |
| Deployment | Ubuntu VPS (NodeJS 22-LTS) |

---

## 🪵 Ecojoiner Generator

`/ecojoiners/generate` turns a visitor's bottle and board measurements into Ecojoiner v3.2
cutting files. The geometry, validation and file writing all live in
`ecojoiner/generate_exports.py` (Python + reportlab); Node maps the form fields onto it, runs it
with `execFile`, and serves the results from `public/ecojoiner_exports/`.

One-time setup — creates `ecojoiner/.venv` and installs reportlab:

```bash
npm run ecojoiner:setup
```

Set `ECOJOINER_PYTHON` in `.env` if you would rather point at a different interpreter. Generated
job folders are swept after `ECOJOINER_JOB_TTL_DAYS` (default 7) days.

---

## 📂 Repository Structure

```
hopeturtles.org/
├── server.js
├── config/
│   ├── db.js
│   └── env.js
├── routes/
│   ├── api/
│   └── pages/
├── public/
│   ├── css/
│   ├── js/
│   ├── img/
│   └── logo/
├── views/
│   ├── index.ejs
│   ├── turtles.ejs
│   └── missions.ejs
├── hopeturtle_schema_v1.1.sql
├── .env.example
└── README.md
```
