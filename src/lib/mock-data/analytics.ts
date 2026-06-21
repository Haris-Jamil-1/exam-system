import type { StatValue } from '@/types';

export const dashboardStats: StatValue[] = [
  { key: 'activeExams', label: 'Active Exams', value: '4', delta: '+1 this week', change: 1, trend: 'up' },
  { key: 'totalStudents', label: 'Total Students', value: '312', delta: '+24 this month', change: 24, trend: 'up' },
  { key: 'avgTrust', label: 'Avg Trust Score', value: '92.4', delta: '+1.8 vs last exam', change: 2, trend: 'up' },
  { key: 'pendingReviews', label: 'Pending Reviews', value: '7', delta: '3 flagged', change: 3, trend: 'up' },
];

export const adminStats: StatValue[] = [
  { key: 'pendingApprovals', label: 'Pending Approvals', value: '3', delta: '2 new today', change: 2, trend: 'up' },
  { key: 'teachers', label: 'Total Teachers', value: '38', delta: '+4 this month', change: 4, trend: 'up' },
  { key: 'students', label: 'Total Students', value: '1,204', delta: '+86 this month', change: 86, trend: 'up' },
  { key: 'avgTrust', label: 'Avg Trust Score', value: '91.2', delta: '+0.6 vs last term', change: 1, trend: 'up' },
];

export const studentStats: StatValue[] = [
  { key: 'upcoming', label: 'Upcoming Exams', value: '3', delta: 'Next: today 2:00 PM', change: 0, trend: 'up' },
  { key: 'completed', label: 'Completed', value: '12', delta: 'This term', change: 0, trend: 'up' },
  { key: 'avgScore', label: 'Average Score', value: '84%', delta: '+5% vs last term', change: 5, trend: 'up' },
  { key: 'trust', label: 'Trust Score', value: '98', delta: 'Excellent standing', change: 0, trend: 'up' },
];

export const analyticsKpis: StatValue[] = [
  { key: 'avgScore', label: 'Exams Conducted', value: '24', delta: '+6 this month', change: 6, trend: 'up' },
  { key: 'avgTrust', label: 'Avg Trust Score', value: '92.4', delta: '+1.8', change: 2, trend: 'up' },
  { key: 'completion', label: 'Avg Pass Rate', value: '72%', delta: '+3%', change: 3, trend: 'up' },
  { key: 'reliability', label: 'Avg Trust Score', value: '81%', delta: '-2%', change: -2, trend: 'down' },
];

export const scoreDistribution = [
  { range: '0–50', count: 8 },
  { range: '51–60', count: 14 },
  { range: '61–70', count: 22 },
  { range: '71–80', count: 31 },
  { range: '81–90', count: 18 },
  { range: '91–100', count: 7 },
];

export const trustTrend = [
  { week: 'Week 1', avgTrust: 90 },
  { week: 'Week 2', avgTrust: 87 },
  { week: 'Week 3', avgTrust: 83 },
  { week: 'Week 4', avgTrust: 81 },
  { week: 'Week 5', avgTrust: 78 },
  { week: 'Week 6', avgTrust: 76 },
  { week: 'Week 7', avgTrust: 80 },
  { week: 'Week 8', avgTrust: 82 },
];

export const questionDifficultyData = [
  { difficulty: 'Easy', correct: 85, incorrect: 15 },
  { difficulty: 'Medium', correct: 62, incorrect: 38 },
  { difficulty: 'Hard', correct: 41, incorrect: 59 },
];

// Recent exams for teacher dashboard display
export const recentExamsData = [
  { id: 'exam-1', title: 'Data Structures Midterm', course: 'CS 301', detail: '120 min · 40 students', students: 40, status: 'live' as const },
  { id: 'exam-2', title: 'Algorithms Final', course: 'CS 401', detail: '90 min · 35 students', students: 35, status: 'scheduled' as const },
  { id: 'exam-3', title: 'Web Dev Quiz 3', course: 'CS 220', detail: '45 min · 28 students', students: 28, status: 'completed' as const },
  { id: 'exam-4', title: 'Networking Basics', course: 'CS 210', detail: '60 min · 32 students', students: 32, status: 'draft' as const },
  { id: 'exam-5', title: 'Database Systems', course: 'CS 350', detail: '90 min · 45 students', students: 45, status: 'completed' as const },
];

// Live alerts for teacher dashboard
export const recentAlertsData = [
  { id: 'a1', student: 'Ali Hassan', event: 'Tab switch detected', time: '2m ago', severity: 'high' as const },
  { id: 'a2', student: 'Sara Ahmed', event: 'No face detected', time: '4m ago', severity: 'high' as const },
  { id: 'a3', student: 'Omar Khalid', event: 'Window blur — 3rd time', time: '7m ago', severity: 'medium' as const },
  { id: 'a4', student: 'Nour Ibrahim', event: 'Audio noise detected', time: '9m ago', severity: 'low' as const },
];

// IDs match mockExams + mockQuestions so /exam/[examId] loads real questions
export const studentExamsData = [
  { id: 'exam-1', title: 'Midterm: Data Structures & Algorithms', course: 'CS 301', status: 'available' as const, schedule: 'Today, 2:00 PM', durationMins: 120, questions: 10 },
  { id: 'exam-3', title: 'Intro to Programming Quiz', course: 'CS 101', status: 'available' as const, schedule: 'Today, 4:00 PM', durationMins: 45, questions: 6 },
  { id: 'exam-2', title: 'Final Exam: Calculus II', course: 'MATH 301', status: 'upcoming' as const, schedule: 'Jun 24, 10:00 AM', durationMins: 90, questions: 4 },
  { id: 'exam-6', title: 'Network Security Final', course: 'CS 410', status: 'upcoming' as const, schedule: 'Jun 26, 1:00 PM', durationMins: 80, questions: 4 },
  { id: 'exam-4', title: 'Organic Chemistry Midterm', course: 'CHEM 210', status: 'completed' as const, schedule: 'Jun 14', durationMins: 90, questions: 3, score: 88, trust: 96 },
  { id: 'exam-7', title: 'Business Analytics Final', course: 'BUS 305', status: 'completed' as const, schedule: 'Jun 10', durationMins: 90, questions: 3, score: 79, trust: 99 },
];
