import { Link } from 'react-router-dom';
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-toastify';

import { Button, Input } from '@tgim/ui';
import { ipc } from '../../lib/ipc';

const NewMoa: React.FC = () => {
  const [path, setPath] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const pickFolder = async () => {
    const result = await open({ directory: true });
    setPath(result);
  };

  const handleCreate = async () => {
    try {
      if (!name) throw Error('이름을 입력해주세요.');
      if (!path) throw Error('경로를 선택해주세요.');

      const data = await ipc.moa.createMoa({
        name,
        path,
      });
      console.log(data);
    } catch (err) {
      toast.error(err?.toString() || '알 수 없는 오류 발생');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-foreground">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold">새 보관함 만들기</h1>
        <p className="text-muted-foreground">이미지 파일 또는 폴더를 선택하세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full px-8">
        <Button variant="card" className="shadow-lg aspect-square" onClick={pickFolder}>
          <div className="flex flex-col items-center justify-center p-4">
            <h2 className="text-xl font-semibold mt-4">폴더 선택</h2>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              보관할 폴더를 선택합니다.
            </p>
          </div>
        </Button>
      </div>

      <div className="w-full max-w-xl mt-8 space-y-2 px-8">
        {path && (
          <span className="w-full max-w-xl bg-muted p-4 rounded-md mt-6 overflow-x-auto text-xs">
            {path}의 경로에 새로운 폴더가 생성됩니다.
          </span>
        )}
        <Input.Input
          placeholder="보관함 이름을 입력해주세요."
          className="bg-sidebar-bg hover:text-sidebar-text hover:bg-sidebar-hover"
          onChange={e => setName(e.target.value)}
        />
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleCreate}>
            생성하기
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewMoa;
