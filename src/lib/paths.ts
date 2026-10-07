import path from "path";

export const DATA_DIR = path.resolve(process.env.TODO_DATA_DIR ?? "data");
export const STATE_DIR = path.resolve(process.env.TODO_STATE_DIR ?? ".state");
