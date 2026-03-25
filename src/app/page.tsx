"use client";

import { useState } from "react";

// タスクの型定義
type Task = {
  id: string;
  title: string;
  penalty: number;
  deadline: string;
  isCompleted: boolean;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [penalty, setPenalty] = useState(500);

  // タスク追加機能
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const newTask: Task = {
      id: crypto.randomUUID(), // 一意のIDを生成
      title,
      penalty,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString(), // 24時間後を期限に設定
      isCompleted: false,
    };

    setTasks([newTask, ...tasks]); // 新しいものを上に表示
    setTitle("");
  };

  // 完了状態を切り替える機能
  const toggleTask = (id: string) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, isCompleted: !task.isCompleted } : task
      )
    );
  };

  // タスクを削除する機能（リストを整理するために追加）
  const deleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black text-black dark:text-white font-sans">
      <main className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Do-Or-Pay</h1>
          <p className="text-zinc-500 text-sm mt-2">自分を追い込み、目標を達成しましょう。</p>
        </header>
        
        {/* 入力フォーム */}
        <form onSubmit={addTask} className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium mb-1">達成する目標</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 毎日30分プログラミングする"
              className="w-full p-2 border rounded-md dark:bg-zinc-800 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">失敗時のペナルティ (¥)</label>
            <input
              type="number"
              value={penalty}
              onChange={(e) => setPenalty(Number(e.target.value))}
              className="w-full p-2 border rounded-md dark:bg-zinc-800 dark:border-zinc-700 outline-none"
            />
          </div>
          <button type="submit" className="bg-black dark:bg-white dark:text-black text-white p-2 rounded-md font-semibold hover:opacity-80 transition active:scale-95">
            タスクをコミットする
          </button>
        </form>

        {/* タスク一覧表示 */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">現在のコミットメント</h2>
          {tasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">まだコミットされたタスクはありません。</p>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`p-4 rounded-lg border flex justify-between items-center transition-all ${
                    task.isCompleted 
                      ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60" 
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"
                  }`}
                >
                  <div className="flex-1">
                    <p className={`font-medium ${task.isCompleted ? "line-through text-zinc-500" : ""}`}>
                      {task.title}
                    </p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-red-500 font-mono font-bold">Penalty: ¥{task.penalty}</span>
                      <span className="text-xs text-zinc-400 font-mono">Limit: {task.deadline}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${
                        task.isCompleted 
                          ? "bg-green-500 border-green-500 text-white" 
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {task.isCompleted ? "✓ 完了" : "完了にする"}
                    </button>
                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="text-xs px-2 py-1.5 text-zinc-400 hover:text-red-500 transition"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}