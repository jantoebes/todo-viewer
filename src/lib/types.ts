export type Status = "backlog" | "to_do" | "in_progress" | "on_hold" | "done";

export interface Task {
  title: string;
  status: Status;
}

export interface Story {
  title: string;
  group: string;
  status: Status;
  tasks: Task[];
}

export interface BoardData {
  stories: Story[];
}
