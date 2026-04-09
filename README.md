# Staff Scheduler

A staff scheduling web application designed specifically for schools and programs serving children with autism. It helps assign trained staff to students while respecting staffing rules, fairness constraints, availability, overnight shifts, PTO, callouts, and swim coverage balancing.

## What It Does

- **Staff Management** — Track staff profiles, availability, PTO, overnight/swim certifications, and training assignments
- **Student Management** — Manage student profiles, approved staff lists, swim support needs, and recurring shift templates
- **Weekly Schedule Board** — Visual 5-day schedule with shift cards showing assignments, warnings, and status. Click any shift to see ranked replacement candidates
- **Auto-Scheduling** — Generate shifts from templates and auto-assign staff using a rule-based scoring engine
- **Callout Handling** — Mark staff as called out; get ranked replacement suggestions with clear explanations of tradeoffs
- **Conflict Detection** — Automatic warnings for untrained assignments, PTO conflicts, overlapping shifts, same-student overuse, and swim load imbalance
- **Fairness Tracking** — Reports on staff workload distribution, swim assignment balance, and staff-student pairing counts
- **CSV Export & Print** — Export weekly schedules to CSV or print directly from the browser

## How Scheduling Logic Works

Staff assignment suggestions use a **rule-based scoring engine** (0-100 points per candidate):

### Hard Filters (automatic exclusion)
- Staff inactive, on PTO, has overlapping shift, or not available at that time

### Scoring Factors
| Factor | Points |
|--------|--------|
| Trained on student | +40 |
| Available during shift hours | +15 |
| Same-student count this week < 2 | +15 |
| Swim load balance (if swim shift) | +10 |
| Overall weekly assignment load | +10 |
| Overnight eligible (if overnight) | +5 |
| Swim certified (if swim shift) | +5 |

### Penalties
| Condition | Penalty |
|-----------|---------|
| Same student 3+ times this week | -20 |
| Not trained on student | -30 |
| Overnight without certification | -50 |

Candidates are ranked by score with tags and warnings shown in plain language. Schedulers can override any suggestion and record a reason.

## Running Locally

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Create database and load demo data
npm run db:reset

# Start development server
npm run dev
```

The app will be available at **http://localhost:3000**.

### Database Commands

```bash
npm run db:migrate   # Create/update database schema
npm run db:seed      # Load demo data (clears existing data)
npm run db:reset     # Run both migrate + seed
```

The SQLite database is stored at `data/schedule.db`.

## Demo Data

The seed script creates:
- **10 staff members** with varied roles, availability, swim/overnight certifications
- **6 students** with training assignments and swim support needs
- **Training assignments** — each student has 4-6 approved staff
- **Availability** — Mon-Fri schedules, some part-time, some overnight
- **2 PTO entries** — Aisha (Apr 13-14), Emily (Apr 15-17)
- **Shift templates** — recurring daily shifts, swim sessions, overnight shifts
- **Sample week** (Apr 13-17, 2026) with pre-assigned shifts
- **1 callout scenario** — Emily called out for a Tuesday shift

## How to Use

### Adding Staff
1. Go to **Staff** page and click **Add Staff**
2. Set name, role, certifications (swim, overnight), max hours
3. Click into the staff detail to set availability, PTO, and trained students

### Adding Students
1. Go to **Students** page and click **Add Student**
2. Set name, swim support needs, and select approved staff
3. Click into student detail to manage trained staff and view shift templates

### Creating a Weekly Schedule
1. Go to **Schedule** page
2. Click **Generate from Templates** to create shifts from recurring templates
3. Click **Auto-Assign Open** to let the scoring engine fill open shifts
4. Click any shift card to see candidates, assign staff, or mark callouts
5. Add ad-hoc shifts with the **+** button on any day

### Handling Callouts
1. On the schedule board, click the phone icon on any assigned shift to mark a callout
2. Go to **Callouts** page to see all unresolved callouts
3. Click **Find Replacement** to see ranked candidates with scores and explanations
4. Assign a replacement

### Viewing Reports
- Go to **Reports** page for workload distribution, swim balance, pairing counts, and uncovered shifts

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** SQLite (via better-sqlite3)
- **Styling:** Tailwind CSS
- **Data Fetching:** SWR
- **Icons:** Lucide React

## Project Structure

```
src/
├── app/              # Pages and API routes
│   ├── api/          # REST API endpoints
│   ├── staff/        # Staff management pages
│   ├── students/     # Student management pages
│   ├── schedule/     # Weekly schedule board
│   ├── callouts/     # Callout management
│   └── reports/      # Reports and fairness
├── components/       # Reusable UI components
├── db/               # Database schema, migrations, seed data
├── lib/
│   └── scheduling/   # Scoring engine, conflict detection, auto-generation
└── types/            # TypeScript type definitions
```

## Future Roadmap

- Drag-and-drop shift reassignment on the schedule board
- Stronger optimization with a constraint solver for initial schedule generation
- Notifications via email/SMS for callouts and schedule changes
- Role-based permissions (supervisor vs. scheduler vs. viewer)
- Multi-week planning with template propagation
- Mobile-responsive layout
- Audit log for all schedule changes
- Staffing ratio support per activity type
- Integration hooks for HR systems, calendars, or communication tools
