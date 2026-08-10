import { useState } from 'react';
import { motion } from 'framer-motion';
import { useInterviewStore } from '../../stores/interviewStore';
import { apiFetch } from '../../lib/api';
import { Play, CheckCircle2, XCircle, Clock, ChevronDown, Unplug } from 'lucide-react';

const LANGUAGES = [
  { id: 71, label: 'Python',     value: 'python'     },
  { id: 63, label: 'JavaScript', value: 'javascript' },
  { id: 60, label: 'Go',         value: 'go'         },
  { id: 62, label: 'Java',       value: 'java'       },
  { id: 54, label: 'C++',        value: 'cpp'        },
];

interface CodeWorkspaceProps {
  testCases?: { stdin: string; expected: string }[];
  hiddenTestCases?: { stdin: string; expected: string }[];
  expectedComplexity?: string;
  sessionId?: string;
  problem?: {
    id?: string;
    title?: string;
    difficulty?: string;
    tags?: string[];
    statement?: string;
  } | null;
  onAccepted?: () => void;
}

export default function CodeWorkspace({ testCases = [], hiddenTestCases, expectedComplexity, sessionId, problem, onAccepted }: CodeWorkspaceProps) {
  const {
    currentCode, editorLanguage, isRunningCode,
    lastCodeResult, updateCode, setEditorLanguage, setRunningCode, setCodeResult,
  } = useInterviewStore();

  const [showLangMenu, setShowLangMenu] = useState(false);

  const currentLang = LANGUAGES.find(l => l.value === editorLanguage) || LANGUAGES[0];

  const runCode = async () => {
    setRunningCode(true);
    setCodeResult(null);
    try {
      const res = await apiFetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: currentCode,
          language: editorLanguage,
          test_cases: testCases,
          hidden_test_cases: hiddenTestCases || [],
          expected_complexity: expectedComplexity,
          session_id: sessionId,
          problem,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setCodeResult(json.data);
        if (onAccepted && json.data.status === 'ACCEPTED' && json.data.totalCount > 0 && json.data.passedCount === json.data.totalCount) {
          onAccepted();
        }
      } else {
        setCodeResult({
          status: 'RUNTIME_ERROR',
          stdout: null,
          stderr: json.error || 'Execution failed',
          timeMs: null,
          memoryKb: null,
          passedCount: 0,
          totalCount: testCases.length,
          fromMock: true,
        });
      }
    } catch (err) {
      console.error('[CodeWorkspace] run failed:', err);
      setCodeResult({
        status: 'RUNTIME_ERROR',
        stdout: null,
        stderr: 'Could not reach the execution service.',
        timeMs: null,
        memoryKb: null,
        passedCount: 0,
        totalCount: testCases.length,
        fromMock: true,
      });
    } finally {
      setRunningCode(false);
    }
  };

  const statusStyle = () => {
    if (!lastCodeResult) return null;
    const map = {
      ACCEPTED:           { color: 'hsl(142 70% 50%)', bg: 'hsl(142 70% 50% / 0.1)', icon: CheckCircle2 },
      WRONG_ANSWER:       { color: 'hsl(0 85% 60%)',   bg: 'hsl(0 85% 60% / 0.1)',   icon: XCircle      },
      TIME_LIMIT_EXCEEDED:{ color: 'hsl(35 90% 55%)',  bg: 'hsl(35 90% 55% / 0.1)',  icon: Clock        },
      RUNTIME_ERROR:      { color: 'hsl(0 85% 60%)',   bg: 'hsl(0 85% 60% / 0.1)',   icon: XCircle      },
      COMPILATION_ERROR:  { color: 'hsl(0 85% 60%)',   bg: 'hsl(0 85% 60% / 0.1)',   icon: XCircle      },
    };
    return map[lastCodeResult.status] || map.WRONG_ANSWER;
  };

  const st = statusStyle();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'hsl(220 15% 4%)',
      border: '1px solid hsl(215 15% 13%)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'hsl(215 15% 8%)',
        borderBottom: '1px solid hsl(215 15% 13%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Traffic lights */}
          {['hsl(0 85% 60%)', 'hsl(35 90% 55%)', 'hsl(142 70% 50%)'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
          ))}
          <span style={{
            marginLeft: 8, fontSize: 13, fontWeight: 600,
            color: 'hsl(174 85% 65%)', fontFamily: 'var(--font-mono)',
          }}>
            solution.{editorLanguage === 'javascript' ? 'js' : editorLanguage === 'python' ? 'py' : editorLanguage}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Language selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowLangMenu(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8,
                background: 'hsl(215 15% 12%)',
                border: '1px solid hsl(215 15% 20%)',
                color: 'hsl(210 10% 70%)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {currentLang.label} <ChevronDown size={12} />
            </button>
            {showLangMenu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                style={{
                  position: 'absolute', top: '110%', right: 0,
                  background: 'hsl(215 15% 10%)',
                  border: '1px solid hsl(215 15% 18%)',
                  borderRadius: 10, overflow: 'hidden',
                  zIndex: 50, minWidth: 130,
                  boxShadow: '0 8px 24px hsl(220 15% 3% / 0.7)',
                }}
              >
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => { setEditorLanguage(lang.value); setShowLangMenu(false); }}
                    style={{
                      display: 'block', width: '100%', padding: '9px 14px',
                      textAlign: 'left', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontFamily: 'var(--font-sans)',
                      background: editorLanguage === lang.value
                        ? 'hsl(176 40% 45% / 0.15)'
                        : 'transparent',
                      color: editorLanguage === lang.value
                        ? 'hsl(174 85% 70%)'
                        : 'hsl(210 10% 65%)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (editorLanguage !== lang.value)
                        (e.currentTarget as HTMLButtonElement).style.background = 'hsl(215 15% 14%)';
                    }}
                    onMouseLeave={e => {
                      if (editorLanguage !== lang.value)
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }}
                  >
                    {lang.label}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Run button */}
          <motion.button
            whileHover={{ scale: isRunningCode ? 1 : 1.04 }}
            whileTap={{ scale: isRunningCode ? 1 : 0.96 }}
            onClick={runCode}
            disabled={isRunningCode}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 16px', borderRadius: 8, border: 'none',
              background: isRunningCode
                ? 'hsl(176 40% 32%)'
                : 'linear-gradient(135deg, hsl(176 40% 42%), hsl(174 85% 55%))',
              color: 'hsl(220 15% 5%)', cursor: isRunningCode ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
              boxShadow: isRunningCode ? 'none' : '0 2px 12px hsl(176 40% 42% / 0.4)',
              transition: 'background 0.25s',
            }}
          >
            <Play size={13} fill="hsl(220 15% 5%)" />
            {isRunningCode ? 'Running…' : 'Run Tests'}
          </motion.button>
        </div>
      </div>

      {/* Code editor (native textarea as Monaco placeholder) */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <textarea
          value={currentCode}
          onChange={e => updateCode(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', height: '100%',
            background: 'hsl(220 15% 4%)',
            color: 'hsl(174 85% 78%)',
            border: 'none', outline: 'none',
            resize: 'none', padding: '20px 24px',
            fontFamily: 'var(--font-mono)',
            fontSize: 14, lineHeight: 1.75,
            tabSize: 4,
          }}
        />
      </div>

      {/* Output panel */}
      {(lastCodeResult || isRunningCode) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.25 }}
          style={{
            borderTop: '1px solid hsl(215 15% 13%)',
            background: 'hsl(215 15% 7%)',
            flexShrink: 0,
          }}
        >
          {isRunningCode ? (
            <div style={{
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
              color: 'hsl(35 90% 65%)', fontSize: 13,
            }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
              >
                <Clock size={14} />
              </motion.div>
              Executing in sandbox…
            </div>
          ) : lastCodeResult && st && (
            <div style={{ padding: '14px 20px' }}>
              {/* Status row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              }}>
                <st.icon size={15} color={st.color} />
                <span style={{ fontSize: 13, fontWeight: 700, color: st.color }}>
                  {lastCodeResult.status.replace(/_/g, ' ')}
                </span>
                {lastCodeResult.totalCount > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 12, color: lastCodeResult.passedCount === lastCodeResult.totalCount ? 'hsl(142 70% 55%)' : 'hsl(35 90% 55%)',
                    background: lastCodeResult.passedCount === lastCodeResult.totalCount ? 'hsl(142 70% 50% / 0.12)' : 'hsl(35 90% 55% / 0.12)',
                    padding: '2px 10px', borderRadius: 999,
                    border: `1px solid ${lastCodeResult.passedCount === lastCodeResult.totalCount ? 'hsl(142 70% 50% / 0.3)' : 'hsl(35 90% 55% / 0.3)'}`,
                  }}>
                    {lastCodeResult.passedCount}/{lastCodeResult.totalCount} tests passed
                    {lastCodeResult.visibleTotalCount != null && lastCodeResult.hiddenTotalCount != null && lastCodeResult.hiddenTotalCount > 0 && (
                      <span style={{ opacity: 0.75, marginLeft: 6 }}>
                        ({lastCodeResult.visiblePassedCount ?? 0}/{lastCodeResult.visibleTotalCount} + {lastCodeResult.hiddenPassedCount ?? 0}/{lastCodeResult.hiddenTotalCount} hidden)
                      </span>
                    )}
                  </span>
                )}
                {lastCodeResult.fromMock && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: 'hsl(210 10% 50%)',
                    background: 'hsl(215 15% 12%)',
                    padding: '2px 8px', borderRadius: 999,
                    border: '1px solid hsl(215 15% 20%)',
                  }}>
                    <Unplug size={10} /> offline fallback
                  </span>
                )}
                {(lastCodeResult.timeMs != null || lastCodeResult.memoryKb != null) && (
                  <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {lastCodeResult.timeMs != null && <span>{lastCodeResult.timeMs}ms</span>}
                    {lastCodeResult.memoryKb != null && <span>{lastCodeResult.memoryKb}KB</span>}
                  </span>
                )}
              </div>
              {/* stdout */}
              {lastCodeResult.stdout && (
                <pre style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'hsl(210 10% 65%)', lineHeight: 1.7,
                  background: 'hsl(215 15% 5%)',
                  border: '1px solid hsl(215 15% 12%)',
                  borderRadius: 8, padding: '10px 14px',
                  overflowX: 'auto', maxHeight: 100,
                  margin: 0,
                }}>
                  {lastCodeResult.stdout}
                </pre>
              )}
              {/* stderr */}
              {lastCodeResult.stderr && (
                <pre style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'hsl(0 85% 65%)', lineHeight: 1.7,
                  marginTop: 8, padding: '8px 14px',
                  background: 'hsl(0 85% 60% / 0.08)',
                  border: '1px solid hsl(0 85% 60% / 0.2)',
                  borderRadius: 8, overflow: 'auto', maxHeight: 80,
                  margin: 0,
                }}>
                  {lastCodeResult.stderr}
                </pre>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
