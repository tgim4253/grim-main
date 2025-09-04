import { v4 as uuidv4 } from 'uuid';

const createNewId = () => {
  const id = uuidv4();
  return id;
};

export { createNewId };
