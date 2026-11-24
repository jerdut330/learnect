/* LearNect demo: the one shared sample data file.
   Every screen reads from here, so names, times, prices and seats always agree.
   All people, course codes and schedules are SAMPLE DATA for the showcase demo. */

window.LN_DATA = (function () {
  /* Real dates, in Jakarta time (UTC+7 all year, the same clock the database uses).
     "This week" runs Monday to Sunday around today. Sessions and classes repeat every week on the same
     weekday, so on showcase day (Wed 25 Nov 2026) this is the week of 23 to 29 Nov. */
  var JKT_MS = 7 * 60 * 60000;
  var MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var jkt = new Date(Date.now() + JKT_MS); // read with the UTC getters to get Jakarta's wall clock
  var TODAY_INDEX = (jkt.getUTCDay() + 6) % 7; // 0 = Monday
  function utcDay(offset) { return new Date(Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth(), jkt.getUTCDate() - TODAY_INDEX + offset)); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  var monday = utcDay(0), sunday = utcDay(6), lastSat = utcDay(-2);
  var TODAY = iso(utcDay(TODAY_INDEX));
  var WEEK_START = iso(monday);
  var WEEK_LABEL = monday.getUTCMonth() === sunday.getUTCMonth()
    ? monday.getUTCDate() + ' to ' + sunday.getUTCDate() + ' ' + MON_S[sunday.getUTCMonth()]
    : monday.getUTCDate() + ' ' + MON_S[monday.getUTCMonth()] + ' to ' + sunday.getUTCDate() + ' ' + MON_S[sunday.getUTCMonth()];
  // When a slot this week starts, as a real timestamp, and whether that time has already come.
  function startsAt(day, hhmm) { var p = hhmm.split(':'); return Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + day, +p[0], +p[1]) - JKT_MS; }
  function isPast(day, hhmm) { return startsAt(day, hhmm) <= Date.now(); }
  // A full refund needs at least 24 hours' notice (the refund rule below).
  function refundable(day, hhmm) { return startsAt(day, hhmm) - Date.now() >= 24 * 60 * 60000; }

  var courses = {
    ml:   { id: 'ml',   name: 'Machine Learning', code: 'COMP6799', colour: 'cobalt' },
    calc: { id: 'calc', name: 'Calculus',         code: 'MATH6031', colour: 'tomato' },
    prog: { id: 'prog', name: 'Programming',      code: 'COMP6047', colour: 'teal' }
  };

  var mentors = {
    kevin: { id: 'kevin', name: 'Kevin',  full: 'Kevin Pratama',  major: 'Computer Science, 2023', rating: 4.9, sessions: 38, initial: 'K',
             quote: 'I’ll walk you through regression step by step, then we’ll work practice questions together.' },
    nadia: { id: 'nadia', name: 'Nadia',  full: 'Nadia Putri',    major: 'Mathematics, 2022',      rating: 5.0, sessions: 52, initial: 'N',
             quote: 'We’ll break down derivative rules and work through the steps behind each answer.' },
    alya:  { id: 'alya',  name: 'Alya',   full: 'Alya Rahman',    major: 'Information Systems, 2023', rating: 4.8, sessions: 21, initial: 'A',
             quote: 'Loops click once you trace them by hand. We’ll do that together, then write our own.' },
    raka:  { id: 'raka',  name: 'Raka',   full: 'Raka Wijaya',    major: 'Statistics, 2022',       rating: 4.7, sessions: 17, initial: 'R',
             quote: 'Limits are the foundation for everything after. We’ll make them feel obvious.' },
    dimas: { id: 'dimas', name: 'Dimas',  full: 'Dimas Saputra',  major: 'Computer Science, 2022', rating: 4.9, sessions: 44, initial: 'D',
             quote: 'I draw every query before I write it. You’ll leave able to do the same.' }
  };

  // Alex's classes from KRS (sample). day: 0 = Monday ... 6 = Sunday of the demo week.
  var classes = [
    { day: 0, start: '07:20', end: '09:00', course: 'calc', room: 'Anggrek 0702', title: 'MATH6031 Calculus I' },
    { day: 0, start: '09:20', end: '11:00', course: 'prog', room: 'Anggrek 0701', title: 'COMP6047 Algorithm Design' },
    { day: 1, start: '13:20', end: '15:00', course: 'ml',   room: 'Syahdan 0604', title: 'COMP6799 Machine Learning' },
    { day: 2, start: '09:20', end: '11:00', course: 'calc', room: 'Anggrek 0702', title: 'MATH6031 Calculus I' },
    { day: 2, start: '15:20', end: '17:00', course: 'prog', room: 'Anggrek 0805', title: 'COMP6047 Algorithm Design Lab' },
    { day: 3, start: '07:20', end: '09:00', course: 'ml',   room: 'Syahdan 0604', title: 'COMP6799 Machine Learning' },
    { day: 4, start: '11:20', end: '13:00', course: 'prog', room: 'Anggrek 0701', title: 'COMP6047 Algorithm Design' },
    { day: 5, start: '09:20', end: '11:00', course: 'prog', room: 'Anggrek 0701', title: 'COMP6047 Algorithm Design' }
  ];

  var ONLINE = { type: 'online', label: 'Online', place: 'Google Meet', detail: 'Your meeting link appears in My Sessions 15 minutes before the start.' };

  var sessions = [
    { id: 'regression', course: 'ml', mentor: 'kevin', day: 5, start: '13:00', end: '14:30', price: 25000, seats: 8, booked: 5,
      title: 'Regression Finally Makes Sense', format: ONLINE,
      blurb: 'A small-group session for students who want to understand regression and practise exam-style questions.',
      learn: ['Read slope, intercept and what they predict.', 'Interpret regression output and common errors.', 'Work through exam-style regression questions.'],
      bring: ['Familiarity with basic algebra.', 'A laptop, stable internet and your lecture notes.'] },
    { id: 'derivatives', course: 'calc', mentor: 'nadia', day: 6, start: '10:00', end: '11:30', price: 30000, seats: 6, booked: 2,
      title: 'Derivatives Made Clear',
      format: { type: 'onsite', label: 'On-site', place: 'Study Room A, Anggrek Campus', detail: 'Kemanggisan. Arrive 10 minutes early; the room is included in the price.' },
      blurb: 'Work through derivatives with a small group, ask questions, and practise solving problems together.',
      learn: ['Apply the power, product and quotient rules.', 'Use the chain rule with confidence.', 'Solve exam-style derivative problems.'],
      bring: ['Familiarity with basic algebra and functions.', 'Your lecture notes, a notebook and a pen.'] },
    { id: 'python', course: 'prog', mentor: 'alya', day: 6, start: '13:00', end: '14:30', price: 20000, seats: 8, booked: 3,
      title: 'Python Loops & Functions', format: ONLINE,
      blurb: 'Trace loops by hand, then write your own functions with a mentor checking each step.',
      learn: ['Trace for and while loops line by line.', 'Write functions with parameters and return values.', 'Fix the loop bugs that cost marks in quizzes.'],
      bring: ['Python installed, or a free Google Colab account.', 'Any loop exercise you got stuck on.'] },
    { id: 'limits', course: 'calc', mentor: 'raka', day: 5, start: '10:00', end: '11:30', price: 25000, seats: 6, booked: 6,
      title: 'Limits & Continuity Review',
      format: { type: 'onsite', label: 'On-site', place: 'Study Room 2, Alam Sutera Campus', detail: 'Alam Sutera. Arrive 10 minutes early.' },
      blurb: 'A fast review of limits and continuity before the midterm.',
      learn: ['Evaluate limits algebraically.', 'Spot and classify discontinuities.', 'Practise past-paper limit questions.'],
      bring: ['Your formula sheet.', 'A notebook and a pen.'] },
    { id: 'trees', course: 'ml', mentor: 'kevin', day: 5, start: '16:00', end: '17:00', price: 20000, seats: 10, booked: 2,
      title: 'Decision Trees 101', format: ONLINE,
      blurb: 'Build a decision tree by hand, then see how the library version makes the same choices.',
      learn: ['Calculate entropy and information gain.', 'Grow a small tree on paper.', 'Read a fitted tree’s output.'],
      bring: ['A laptop and stable internet.', 'Your lecture slides on classification.'] },
    { id: 'sql', course: 'prog', mentor: 'dimas', day: 5, start: '11:00', end: '12:00', price: 20000, seats: 10, booked: 4,
      title: 'SQL Joins, Visually', format: ONLINE,
      blurb: 'Draw each join before you write it, so you always know which rows come back.',
      learn: ['Tell inner, left and full joins apart.', 'Predict the rows a join returns.', 'Write joins for typical lab questions.'],
      bring: ['A laptop with any SQL editor, or an online one.', 'A lab question you found hard.'] },
    { id: 'recursion', course: 'prog', mentor: 'dimas', day: 6, start: '15:30', end: '17:00', price: 25000, seats: 8, booked: 7,
      title: 'Recursion You Can Trace',
      format: { type: 'onsite', label: 'On-site', place: 'Room 0612, Syahdan Campus', detail: 'Kemanggisan. Arrive 10 minutes early.' },
      blurb: 'Trace recursive calls on paper until base cases and call stacks feel natural.',
      learn: ['Find the base case and the recursive step.', 'Draw the call stack for any recursive function.', 'Turn a loop into recursion and back.'],
      bring: ['A notebook and a pen.', 'Your laptop, if you want to run the examples.'] },
    { id: 'integrals', course: 'calc', mentor: 'nadia', day: 3, start: '18:30', end: '20:00', price: 25000, seats: 6, booked: 1,
      title: 'Integrals Without Panic', format: ONLINE,
      blurb: 'Substitution and integration by parts, one clear method at a time.',
      learn: ['Choose the right integration method.', 'Use substitution step by step.', 'Apply integration by parts without guessing.'],
      bring: ['Your derivative rules sheet.', 'A laptop and stable internet.'] },
    { id: 'neural', course: 'ml', mentor: 'kevin', day: 4, start: '19:00', end: '20:30', price: 25000, seats: 8, booked: 6,
      title: 'Neural Networks, Intuitively', format: ONLINE,
      blurb: 'What a neuron, a layer and a loss actually do, drawn before any code.',
      learn: ['Follow a forward pass by hand.', 'See what gradient descent changes.', 'Read a training curve.'],
      bring: ['A laptop and stable internet.', 'Your notes on linear regression.'] }
  ];

  return {
    TODAY: TODAY,             // today's date in Jakarta, YYYY-MM-DD
    TODAY_INDEX: TODAY_INDEX, // 0 = Monday of this week
    WEEK_START: WEEK_START,   // this week's Monday, YYYY-MM-DD
    WEEK_LABEL: WEEK_LABEL,   // for example "23 to 29 Nov"
    startsAt: startsAt,
    isPast: isPast,
    refundable: refundable,
    user: { name: 'Alex', full: 'Alex Santoso', campus: 'Kemanggisan', major: 'Computer Science' },
    courses: courses,
    mentors: mentors,
    classes: classes,
    sessions: sessions,
    refundRule: 'Cancel at least 24 hours before the session for a full refund. Later cancellations are non-refundable. If the mentor cancels, you get a full refund.',
    commission: 0.2,

    /* Become a mentor and Host (sample data) */
    campuses: ['Kemanggisan (Anggrek & Syahdan)', 'Alam Sutera', 'Bekasi', 'Senayan'],
    applySeed: {
      campus: 'Kemanggisan (Anggrek & Syahdan)', courses: ['prog'], gpa: '3.72', transcript: false, format: 'both', confirm: false,
      why: 'I got an A in programming last semester and helped my study group fix loop and array bugs before the final. I explain each step on paper first.'
    },
    // What Alex teaches once approved. 5 × Rp25.000 × 80% = Rp100.000 projected.
    hostSeed: [
      { id: 'h-arrays', course: 'prog', title: 'Arrays & Strings Drills', day: 6, start: '19:00', end: '20:30', price: 25000, seats: 6, booked: 5, type: 'online', place: 'Google Meet' },
      { id: 'h-debug', course: 'prog', title: 'Debug Your First Program', day: 3, start: '16:00', end: '17:00', price: 20000, seats: 8, booked: 0, type: 'onsite', place: 'Study Room B, Anggrek Campus' }
    ],
    newSessionSeed: { course: 'prog', title: 'Loops Practice Clinic', day: 6, start: '16:00', len: 90, format: 'online', seats: 6, price: 25000 },

    /* A finished session, so the rating flow has something to rate */
    past: [
      { id: 'basics', title: 'Python Basics Review', course: 'prog', mentor: 'alya', date: 'Sat ' + lastSat.getUTCDate() + ' ' + MON_S[lastSat.getUTCMonth()], start: '13:00', end: '14:30', price: 20000 }
    ],
    ratingTags: ['Clear explanations', 'Good pace', 'Exam-focused', 'Friendly', 'Useful examples'],

    help: [
      { q: 'How do I cancel a booking?', a: 'Open My Sessions and tap Cancel. At least 24 hours before the session, you get a full refund.' },
      { q: 'What if my mentor cancels?', a: 'You get a full refund, and the session moves to Cancelled in My Sessions.' },
      { q: 'How do I pay?', a: 'With QRIS, using any banking or e-wallet app.' },
      { q: 'When do mentors get paid?', a: 'After a session is completed. Mentors keep 80% of each booking and LearNect takes 20%.' },
      { q: 'How are mentors approved?', a: 'Applicants share their transcript and GPA, and say how they would teach the course, before they can publish sessions.' }
    ]
  };
})();
