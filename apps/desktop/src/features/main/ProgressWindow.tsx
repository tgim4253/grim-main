interface Props {
  progress: AppProgressEvent;
}

const ProgressWindow: React.FC<Props> = ({ progress }) => {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-background-0">
      <div className="w-full ">
        <div className="w-full bg-background-2 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${
              progress.stage === 'Error' ? 'bg-red-500' : 'bg-accent'
            }`}
            style={{ width: `${progress.percent}%` }}
          ></div>
        </div>
        <div className="mb-2 text-sm font-medium text-foreground text-center">
          {progress.stage} {progress.note ? `- ${progress.note}` : ''}
        </div>
        {/* <div className="text-right text-xs mt-1 text-foreground">{progress.percent}%</div> */}
      </div>
    </div>
  );
};

export default ProgressWindow;
