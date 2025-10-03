interface Props {
  progress: AppProgressEvent;
}

const ProgressWindow: React.FC<Props> = ({ progress }) => {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-surface">
      <div className="w-full ">
        <div className="w-full h-3 rounded-full bg-surface-muted">
          <div
            className={`h-3 rounded-full ${
              progress.stage === 'Error' ? 'bg-status-danger' : 'bg-accent'
            }`}
            style={{ width: `${String(progress.percent)}%` }}
          ></div>
        </div>
        <div className="mb-2 text-sm font-medium text-text text-center">
          {progress.stage} {progress.note ? `- ${progress.note}` : ''}
        </div>
        {/* <div className="text-right text-xs mt-1 text-text">{progress.percent}%</div> */}
      </div>
    </div>
  );
};

export default ProgressWindow;
