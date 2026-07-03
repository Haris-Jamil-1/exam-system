import type { Question } from '@/types';

export type PerQuestion = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  response: string | string[] | Record<string, string>;
  isCorrect: boolean;
  marksAwarded: number;
};

export function scoreAnswers(questions: Question[], answers: Record<string, string | string[] | Record<string, string>>) {
  let score = 0;
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const perQuestion: PerQuestion[] = [];

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer && answer !== '') {
      perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: '', isCorrect: false, marksAwarded: 0 });
      continue;
    }

    let correct = false;
    let marksAwarded = 0;

    switch (q.type) {
      case 'mcq':
      case 'true_false': {
        const selectedOpt = q.options?.find(o => o.id === (answer as string));
        correct = selectedOpt?.isCorrect === true;
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'fill_blank':
      case 'short_answer':
        correct =
          typeof answer === 'string' &&
          typeof q.correctAnswer === 'string' &&
          answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        marksAwarded = correct ? q.marks : 0;
        break;
      case 'mrq': {
        if (Array.isArray(answer) && q.options) {
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
        }
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'matching': {
        if (
          answer !== null &&
          typeof answer === 'object' &&
          !Array.isArray(answer) &&
          q.options &&
          Array.isArray(q.correctAnswer)
        ) {
          // New format: { leftOptionId: selectedRightText } — partial credit per pair
          const matchMap = answer as Record<string, string>;
          const rightLabels = q.correctAnswer as string[];
          let correctPairs = 0;
          q.options.forEach((opt, i) => {
            if (matchMap[opt.id] === rightLabels[i]) correctPairs++;
          });
          correct = correctPairs === q.options.length;
          marksAwarded = q.options.length > 0
            ? parseFloat(((q.marks / q.options.length) * correctPairs).toFixed(2))
            : 0;
        } else if (Array.isArray(answer) && q.options) {
          // Legacy format: all-or-nothing
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
          marksAwarded = correct ? q.marks : 0;
        }
        break;
      }
      case 'ordering': {
        // Partial credit: 1 point per correctly-positioned item
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer) && q.options) {
          const studentTexts = (answer as string[]).map(id => q.options?.find(o => o.id === id)?.text ?? '');
          const expected = q.correctAnswer as string[];
          let correctPositions = 0;
          studentTexts.forEach((text, i) => {
            if (text === expected[i]) correctPositions++;
          });
          correct = correctPositions === expected.length;
          marksAwarded = expected.length > 0
            ? parseFloat(((q.marks / expected.length) * correctPositions).toFixed(2))
            : 0;
        }
        break;
      }
      case 'essay':
      case 'coding':
      case 'file_upload':
        // Manual / async grading
        correct = false;
        marksAwarded = 0;
        break;
    }

    score += marksAwarded;
    perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: answer ?? '', isCorrect: correct, marksAwarded });
  }

  return { score, totalMarks, perQuestion };
}
