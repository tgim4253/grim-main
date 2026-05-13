export type PresetSettingsMessageProps = {
  error?: string | null;
  status?: string | null;
};

export function PresetSettingsMessage({ error, status }: PresetSettingsMessageProps) {
  return (
    <>
      {error ? <div className="session-preset-settings__message is-error">{error}</div> : null}
      {status ? (
        <div className="session-preset-settings__message" role="status">
          {status}
        </div>
      ) : null}
    </>
  );
}
