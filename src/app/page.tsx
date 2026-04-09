"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
// limit を追加でインポート
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Task = {
  id: string;
  userId: string;
  userName?: string;  // 追加: ユーザー名
  userPhoto?: string; // 追加: ユーザーアイコン
  title: string;
  penalty: number;
  deadline: string;
  isCompleted: boolean;
  createdAt: number;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]); // みんなのタスク用ステート
  const [viewMode, setViewMode] = useState<"personal" | "global">("personal"); // 表示切り替え用ステート

  const [title, setTitle] = useState("");
  const [penalty, setPenalty] = useState(500);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // 1. 自分のタスクを取得するクエリ
        const personalQuery = query(
          collection(db, "tasks"),
          where("userId", "==", currentUser.uid),
          orderBy("createdAt", "desc")
        );

        const unsubscribePersonal = onSnapshot(personalQuery, (snapshot) => {
          setTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Task[]);
        });

        // 2. みんなのタスク（全ユーザーの最新30件）を取得するクエリ
        const globalQuery = query(
          collection(db, "tasks"),
          orderBy("createdAt", "desc"),
          limit(30)
        );

        const unsubscribeGlobal = onSnapshot(globalQuery, (snapshot) => {
          setGlobalTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Task[]);
        });

        // クリーンアップ関数
        return () => {
          unsubscribePersonal();
          unsubscribeGlobal();
        };
      } else {
        setTasks([]);
        setGlobalTasks([]);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider).catch(console.error);
  };

  const handleLogout = async () => {
    await signOut(auth).catch(console.error);
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !user) return;

    try {
      await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        userName: user.displayName || "匿名ユーザー", // 名前を保存
        userPhoto: user.photoURL || "",             // アイコンを保存
        title,
        penalty,
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString(),
        isCompleted: false,
        createdAt: Date.now(),
      });
      setTitle("");
    } catch (error) {
      console.error("タスク追加エラー:", error);
    }
  };

  const toggleTask = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "tasks", id), { isCompleted: !currentStatus });
    } catch (error) {
      console.error("タスク更新エラー:", error);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, "tasks", id));
    } catch (error) {
      console.error("タスク削除エラー:", error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black text-black dark:text-white">
        <h1 className="text-4xl font-bold mb-4 tracking-tight">Do-Or-Pay</h1>
        <button onClick={handleLogin} className="bg-black dark:bg-white dark:text-black text-white px-6 py-3 rounded-full font-bold hover:opacity-80 transition">
          Googleでログインして始める
        </button>
      </div>
    );
  }

  // 表示するリストを切り替え
  const displayTasks = viewMode === "personal" ? tasks : globalTasks;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black text-black dark:text-white font-sans">
      <main className="max-w-2xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <h1 className="text-3xl font-bold tracking-tight">Do-Or-Pay</h1>
          <div className="flex items-center gap-4">
            {user.photoURL && <img src={user.photoURL} alt="アイコン" className="w-10 h-10 rounded-full border border-zinc-300 dark:border-zinc-700" />}
            <button onClick={handleLogout} className="text-sm px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">ログアウト</button>
          </div>
        </header>

        {/* タスク入力フォーム */}
        <form onSubmit={addTask} className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium mb-1">達成する目標</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 毎日30分プログラミングする" className="w-full p-2 border rounded-md dark:bg-zinc-800 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">失敗時のペナルティ (¥)</label>
            <input type="number" value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} className="w-full p-2 border rounded-md dark:bg-zinc-800 dark:border-zinc-700 outline-none" />
          </div>
          <button type="submit" className="bg-black dark:bg-white dark:text-black text-white p-2 rounded-md font-semibold hover:opacity-80 transition active:scale-95">タスクをコミットする</button>
        </form>

        <div className="space-y-4">
          {/* タブ切り替えボタン */}
          <div className="flex gap-2 bg-zinc-200 dark:bg-zinc-800 p-1 rounded-lg w-fit">
            <button 
              onClick={() => setViewMode("personal")}
              className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode === "personal" ? "bg-white dark:bg-zinc-600 shadow-sm" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}
            >
              自分のタスク
            </button>
            <button 
              onClick={() => setViewMode("global")}
              className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode === "global" ? "bg-white dark:bg-zinc-600 shadow-sm" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}
            >
              みんなのタスク
            </button>
          </div>

          {displayTasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">タスクはありません。</p>
          ) : (
            <div className="grid gap-3">
              {displayTasks.map((task) => (
                <div key={task.id} className={`p-4 rounded-lg border flex justify-between items-center transition-all ${task.isCompleted ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"}`}>
                  
                  <div className="flex-1">
                    {/* ユーザー情報の表示 (みんなのタスク用) */}
                    <div className="flex items-center gap-2 mb-2">
                      {task.userPhoto ? (
                        <img src={task.userPhoto} alt="User" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                      )}
                      <span className="text-xs text-zinc-500 font-medium">{task.userName || "名無しユーザー"}</span>
                    </div>

                    <p className={`font-medium ${task.isCompleted ? "line-through text-zinc-500" : ""}`}>{task.title}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-red-500 font-mono font-bold">Penalty: ¥{task.penalty}</span>
                      <span className="text-xs text-zinc-400 font-mono">Limit: {task.deadline}</span>
                    </div>
                  </div>

                  {/* 完了・削除ボタン (自分のタスクの時だけ操作可能にする) */}
                  {task.userId === user.uid && (
                    <div className="flex gap-2">
                      <button onClick={() => toggleTask(task.id, task.isCompleted)} className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${task.isCompleted ? "bg-green-500 border-green-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700"}`}>
                        {task.isCompleted ? "✓ 完了" : "完了にする"}
                      </button>
                      <button onClick={() => deleteTask(task.id)} className="text-xs px-2 py-1.5 text-zinc-400 hover:text-red-500 transition">削除</button>
                    </div>
                  )}
                  {/* 他人のタスクの場合はステータスだけ表示 */}
                  {task.userId !== user.uid && task.isCompleted && (
                     <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">達成済</span>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}