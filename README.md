# LearNect

LearNect is a peer-tutoring marketplace for university students, starting around the BINUS campuses. Students can book small-group sessions that fit the free gaps in their week, or teach a course they know well and keep 80% of each booking.

This is a showcase demo. The mentors, courses and class timetable are sample data, QRIS payment is simulated, and no real money is charged.

The website's booking and hosting product (`website/app/`) has a real backend on [Supabase](https://supabase.com): accounts (email and password, or guest), and bookings, seats, mentor applications, hosted sessions and ratings that every visitor shares. The phone app (`demo/`) keeps its sample data in each browser tab.

## Try it online

- **Website:** https://jerdut330.github.io/learnect/
- **Booking and hosting:** https://jerdut330.github.io/learnect/website/app/
- **Phone app:** https://jerdut330.github.io/learnect/demo/

## Run it on your computer

You need [Git](https://git-scm.com/downloads) and [Python 3](https://www.python.org/downloads/).

```bash
git clone https://github.com/jerdut330/learnect.git
cd learnect
python -m http.server 8000
```

Keep that terminal open, then open:

- **Website:** http://localhost:8000/
- **Booking and hosting:** http://localhost:8000/website/app/
- **Phone app:** http://localhost:8000/demo/

On macOS or Linux, use `python3` if `python` is not found. Press `Ctrl+C` in the terminal to stop the server.

Run it through this local server. Opening the HTML files directly by double-clicking them will not work properly.

## What's inside

- `website/`: the desktop website and booking product
- `demo/`: the phone app and the sample data both versions share
- `backend/`: the Supabase database. `backend/supabase/setup.sql` creates the tables, access rules and the functions that check every booking, application and hosted session on the server, then adds the sample sessions. Rebuild it from `demo/js/data.js` with `node backend/make-setup.mjs`.

Keep `website/` and `demo/` next to each other, because the website reads `demo/js/data.js`.

## Backend

`website/app/config.js` holds the Supabase project address and its publishable key. That key is meant to be public: the database's access rules decide what anyone can read or change. Leave both values empty to run the booking product as the offline demo, with sample data in each browser tab. If Supabase can't be reached, the site switches to the offline demo by itself.

To set up your own project: create one at supabase.com, run `backend/supabase/setup.sql` in its SQL Editor, turn on anonymous sign-ins and turn off email confirmation under Authentication, then put its address and publishable key in `config.js`.
