# LearNect

LearNect is a peer-tutoring marketplace for university students, starting around the BINUS campuses. Students can book small-group sessions that fit the free gaps in their week, or teach a course they know well and keep 80% of each booking.

This is a showcase demo. All people, courses, schedules and bookings are sample data, QRIS payment is simulated, and no real money is charged.

## Run it

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

Keep `website/` and `demo/` next to each other, because the website reads `demo/js/data.js`.
