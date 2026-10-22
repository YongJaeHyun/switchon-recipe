import { describe, expect, it, vi } from 'vitest';
import { isUpdateNetworkError, runStartupUpdate, type OtaDeps } from './otaUpdate';

const deps = (overrides: Partial<OtaDeps> = {}): OtaDeps => ({
  checkForUpdate: vi.fn(async () => true),
  fetchUpdate: vi.fn(async () => {}),
  reload: vi.fn(async () => {}),
  onReadyLater: vi.fn(),
  ...overrides,
});

const never = () => new Promise<never>(() => {});

describe('runStartupUpdate', () => {
  it('downloads and reloads immediately when an update is available in time', async () => {
    const d = deps();
    expect(await runStartupUpdate(d, 1000)).toBe('reloaded');
    expect(d.fetchUpdate).toHaveBeenCalled();
    expect(d.reload).toHaveBeenCalled();
  });

  it('does nothing when there is no update', async () => {
    const d = deps({ checkForUpdate: vi.fn(async () => false) });
    expect(await runStartupUpdate(d, 1000)).toBe('none');
    expect(d.fetchUpdate).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('opens the current version after the timeout and applies the download later', async () => {
    let finishDownload!: () => void;
    const d = deps({
      fetchUpdate: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishDownload = resolve;
          })
      ),
    });

    expect(await runStartupUpdate(d, 10)).toBe('pending');
    expect(d.reload).not.toHaveBeenCalled();

    finishDownload();
    await vi.waitFor(() => expect(d.onReadyLater).toHaveBeenCalled());
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('opens the app when the check hangs', async () => {
    const d = deps({ checkForUpdate: vi.fn(never) });
    expect(await runStartupUpdate(d, 10)).toBe('pending');
  });

  it('opens the app when checking fails', async () => {
    const d = deps({
      checkForUpdate: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await runStartupUpdate(d, 1000)).toBe('error');
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe('isUpdateNetworkError', () => {
  it('네트워크 때문에 업데이트 확인·다운로드가 실패한 경우는 true', () => {
    expect(
      isUpdateNetworkError(
        new Error(
          "Call to function 'ExpoUpdates.checkForUpdateAsync' has been rejected.\n→ Caused by: Failed to check for update"
        )
      )
    ).toBe(true);
    expect(isUpdateNetworkError(new Error('Failed to download new update'))).toBe(true);
    expect(isUpdateNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isUpdateNetworkError(new Error('timeout of 5000ms exceeded'))).toBe(true);
  });

  it('그 밖의 오류는 false', () => {
    expect(isUpdateNetworkError(new Error('Update is not compatible'))).toBe(false);
    expect(isUpdateNetworkError('Failed to check for update')).toBe(false);
    expect(isUpdateNetworkError(undefined)).toBe(false);
  });
});
