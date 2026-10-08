import { calculateMissionHoursWithJournal } from './src/calculators/missionCalculator.js';
import { generatePrePlanningShifts } from './src/calculators/prePlanner.js';

const config = {
    mode: 'daily',
    startDate: '2026-07-08',
    endDate: '2026-07-15',
    startTime: '20:00',
    endTime: '08:00',
    selectedDays: [0, 1, 2, 3, 4, 5, 6], // All days
    weekendH24: true,
    weekendH24StartAtMidnight: true,
    holidayH24: true,
    holidayH24StartAtMidnight: true,
    nightShiftStart: '21:00',
    nightShiftEnd: '06:00',
    agents: 1,
    qualification: 'ads_confirme'
};

const journal = calculateMissionHoursWithJournal(config);

console.log("=== DAILY JOURNAL DAYS ===");
journal.days.forEach(d => {
    console.log(`Day: ${d.date} (${new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'long' })}), intervals:`, d.intervals);
});

const shifts = generatePrePlanningShifts(journal.days, config);
console.log("=== SHIFTS GENERATED ===");
shifts.forEach(s => {
    console.log(`Shift: start=${s.startAt}, end=${s.endAt}, duration=${s.duration}`);
});
