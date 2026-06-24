'use client';
// Phase 3: replace mock run with real code execution API (e.g. Judge0 or Piston)
// Phase 2: save code answer to prisma.answer.upsert({ data: { content: code } })
import { useState } from 'react';
import type { Question } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code2, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface TestResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  isHidden?: boolean;
}

interface Props {
  question: Question;
  value: string;
  onChange: (code: string) => void;
}

const MOCK_OUTPUTS: Record<string, string> = {
  python: '# Python output',
  javascript: '// JS output',
  java: '// Java output',
  cpp: '// C++ output',
  c: '// C output',
  sql: '-- SQL result',
};

export function CodeQuestion({ question, value, onChange }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const lang = question.codeLanguage ?? 'python';
  const visibleTestCases = (question.testCases ?? []).filter(tc => !tc.isHidden);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    // Phase 3: POST to /api/exec with { language: lang, code: value, testCases }
    await new Promise(r => setTimeout(r, 1200));

    if (!value.trim()) {
      setRunError('No code to run. Write some code first.');
      setRunning(false);
      return;
    }

    // Simulate test case results against visible test cases
    const simulated: TestResult[] = visibleTestCases.map((tc, i) => {
      // Naive pass simulation: first test passes if code is non-trivial
      const passed = value.trim().length > 20 && i % 3 !== 2;
      return {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: passed ? tc.expectedOutput : (MOCK_OUTPUTS[lang] ?? '// error'),
        passed,
      };
    });

    if (simulated.length === 0) {
      // No visible test cases — just show a generic run output
      setResults([{
        input: '(sample)',
        expectedOutput: '(see problem statement)',
        actualOutput: MOCK_OUTPUTS[lang] ?? '// no output',
        passed: false,
      }]);
    } else {
      setResults(simulated);
    }
    setRunning(false);
  }

  const passCount = results?.filter(r => r.passed).length ?? 0;

  return (
    <div className="space-y-3">
      {/* Language badge */}
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-blue-600" />
        <Badge variant="info" className="font-mono text-xs uppercase">{lang}</Badge>
        {question.required && (
          <Badge variant="danger" className="text-xs">Required</Badge>
        )}
      </div>

      {/* Starter code hint */}
      {question.starterCode && !value && (
        <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-700">
          Starter code will be pre-filled — clear the editor if you want to start from scratch.
        </div>
      )}

      {/* Code editor */}
      <div className="rounded-xl overflow-hidden border border-slate-700 shadow-sm">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-700">
          <span className="text-xs text-slate-400 font-mono">solution.{lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'java' ? 'java' : lang === 'cpp' ? 'cpp' : lang === 'sql' ? 'sql' : 'c'}</span>
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          </div>
        </div>
        <textarea
          value={value || (question.starterCode ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={14}
          spellCheck={false}
          className="w-full bg-slate-950 text-slate-100 font-mono text-sm px-4 py-3 focus:outline-none resize-y leading-relaxed"
          placeholder={`Write your ${lang} solution here…`}
        />
      </div>

      {/* Visible test cases */}
      {visibleTestCases.length > 0 && (
        <div className="rounded-lg border overflow-hidden text-xs">
          <div className="bg-muted/50 px-3 py-2 font-medium text-muted-foreground">
            Sample Test Cases ({visibleTestCases.length})
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-start px-3 py-1.5 font-medium text-muted-foreground">Input</th>
                <th className="text-start px-3 py-1.5 font-medium text-muted-foreground">Expected</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              {visibleTestCases.map((tc, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-blue-700">{tc.input}</td>
                  <td className="px-3 py-1.5 text-green-700">{tc.expectedOutput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Run button + results */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Button
          type="button"
          onClick={handleRun}
          disabled={running}
          variant="outline"
          size="sm"
          className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? 'Running…' : 'Run Code'}
        </Button>

        {results && !running && (
          <span className={`text-xs font-medium flex items-center gap-1 ${passCount === results.length ? 'text-green-700' : 'text-red-600'}`}>
            {passCount === results.length
              ? <><CheckCircle2 className="h-4 w-4" /> All {results.length} test{results.length !== 1 ? 's' : ''} passed</>
              : <><XCircle className="h-4 w-4" /> {passCount}/{results.length} tests passed</>
            }
          </span>
        )}
      </div>

      {runError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-mono">{runError}</div>
      )}

      {results && !running && (
        <div className="rounded-lg border overflow-hidden text-xs">
          <div className="bg-muted/50 px-3 py-2 font-medium text-muted-foreground">Test Results</div>
          <div className="divide-y font-mono">
            {results.map((r, i) => (
              <div key={i} className={`px-3 py-2 flex items-start gap-3 ${r.passed ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className="text-muted-foreground shrink-0 w-6">{i + 1}.</span>
                <div className="flex-1 space-y-0.5">
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span>in: <span className="text-blue-700">{r.input}</span></span>
                    <span>expected: <span className="text-green-700">{r.expectedOutput}</span></span>
                    <span>got: <span className={r.passed ? 'text-green-700' : 'text-red-600'}>{r.actualOutput}</span></span>
                  </div>
                </div>
                {r.passed
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                  : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                }
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Note: hidden test cases will be evaluated automatically on submission.
      </p>
    </div>
  );
}
