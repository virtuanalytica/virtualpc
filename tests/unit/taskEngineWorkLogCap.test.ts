import * as path from 'path';
import * as os from 'os';

/**
 * Proof for TOP_100 #4 / #14 — the workLog rolling cap.
 *
 * The workLog array was unbounded, which grew task-state.json to 196 MB and
 * blocked the Node event loop on every 5s save tick. logWork() now evicts the
 * oldest overflow so the in-memory log (and therefore the persisted snapshot)
 * can never exceed MAX_WORKLOG (10000) entries.
 *
 * task-engine has heavy module-load side effects: a top-level loadState() that
 * reads the real state file, and several setInterval timers. We install fake
 * timers (so the intervals create no real open handles that would hang Jest)
 * and point VIRTUALPC_STATE_DIR at an empty temp dir (so loadState() finds no
 * file and the log starts empty) BEFORE require-ing the module.
 */
describe('task-engine workLog cap (TOP_100 #4/#14)', () => {
  const MAX_WORKLOG = 10000;
  let taskEngine: typeof import('../../src/task-engine');

  beforeAll(() => {
    jest.useFakeTimers();
    process.env.VIRTUALPC_STATE_DIR = path.join(
      os.tmpdir(),
      `vpc-worklog-cap-test-${process.pid}`
    );
    // require (not import) so the env + fake timers are in place first — ESM
    // imports are hoisted above statements and would defeat the setup.
    taskEngine = require('../../src/task-engine');
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('never retains more than MAX_WORKLOG entries, evicting the oldest', () => {
    const overflow = 100;
    const total = MAX_WORKLOG + overflow;
    for (let i = 0; i < total; i++) {
      taskEngine.logWork('Zip', 'T-1', 'cap test', `sub-${i}`, 'subtask_completed', 1);
    }

    const log = taskEngine.getWorkLog();
    // Capped at exactly MAX_WORKLOG.
    expect(log.length).toBe(MAX_WORKLOG);
    // The oldest `overflow` entries were evicted — first retained is sub-100.
    expect(log[0].subtask).toBe(`sub-${overflow}`);
    // The newest entry is retained.
    expect(log[log.length - 1].subtask).toBe(`sub-${total - 1}`);
  });
});
