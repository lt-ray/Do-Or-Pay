"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Task = {
  id: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  title: string;
  penalty: number;
  deadline: number | string; // 過去の文字列データにも対応するため型を拡張
  isCompleted: boolean;
  createdAt: number;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"personal" | "global">("personal");

  const [title, setTitle] = useState("");
  const [penalty, setPenalty] = useState(500);
  const [user, setUser] = useState<User | null>(null);
  
  // 現在時刻を保持するステート（カウントダウン用）
  const [now, setNow] = useState(Date.now());

  // 1秒ごとに現在時刻を更新するタイマー
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const personalQuery = query(collection(db, "tasks"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
        const unsubscribePersonal = onSnapshot(personalQuery, (snapshot) => {
          setTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Task[]);
        });

        const globalQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"), limit(30));
        const unsubscribeGlobal = onSnapshot(globalQuery, (snapshot) => {
          setGlobalTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Task[]);
        });

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
        userName: user.displayName || "匿名ユーザー",
        userPhoto: user.photoURL || "",
        title,
        penalty,
        // 期限を24時間後の「数値（ミリ秒）」として保存するように変更
        deadline: Date.now() + 24 * 60 * 60 * 1000, 
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

  // 残り時間を計算して整形する関数
  const getRemainingTimeDisplay = (deadline: number | string, isCompleted: boolean) => {
    if (isCompleted) return { text: "完了済み", color: "text-zinc-500" };

    // 過去の文字列データだった場合は数値に変換
    const targetTime = typeof deadline === "string" ? new Date(deadline).getTime() : deadline;
    if (isNaN(targetTime)) return { text: "期限不明", color: "text-zinc-500" };

    const diff = targetTime - now;

    if (diff <= 0) {
      return { text: "⚠️ 期限切れ (ペナルティ執行)", color: "text-red-600 font-bold animate-pulse" };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // ゼロ埋めして時計のように表示 (例: 05:09)
    const formattedMinutes = minutes.toString().padStart(2, "0");
    const formattedSeconds = seconds.toString().padStart(2, "0");

    // 残り時間が1時間を切ったら文字を赤くする
    const color = diff < 1000 * 60 * 60 ? "text-red-500 font-bold" : "text-blue-500 font-medium";

    return { text: `残り ${hours}:${formattedMinutes}:${formattedSeconds}`, color };
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
          <div className="flex gap-2 bg-zinc-200 dark:bg-zinc-800 p-1 rounded-lg w-fit">
            <button onClick={() => setViewMode("personal")} className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode === "personal" ? "bg-white dark:bg-zinc-600 shadow-sm" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}>
              自分のタスク
            </button>
            <button onClick={() => setViewMode("global")} className={`px-4 py-2 text-sm font-bold rounded-md transition ${viewMode === "global" ? "bg-white dark:bg-zinc-600 shadow-sm" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}>
              みんなのタスク
            </button>
          </div>

          {displayTasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">タスクはありません。</p>
          ) : (
            <div className="grid gap-3">
              {displayTasks.map((task) => {
                // ここで残り時間と色を計算
                const timeDisplay = getRemainingTimeDisplay(task.deadline, task.isCompleted);

                return (
                  <div key={task.id} className={`p-4 rounded-lg border flex justify-between items-center transition-all ${task.isCompleted ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"}`}>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {task.userPhoto ? (
                          <img src={task.userPhoto} alt="User" className="w-5 h-5 rounded-full" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                        )}
                        <span className="text-xs text-zinc-500 font-medium">{task.userName || "名無しユーザー"}</span>
                      </div>

                      <p className={`font-medium ${task.isCompleted ? "line-through text-zinc-500" : ""}`}>{task.title}</p>
                      
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-sm font-mono font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded">
                          Penalty: ¥{task.penalty}
                        </span>
                        {/* カウントダウン表示部分 */}
                        <span className={`text-sm font-mono ${timeDisplay.color}`}>
                          ⏱ {timeDisplay.text}
                        </span>
                      </div>
                    </div>

                    {task.userId === user.uid && (
                      <div className="flex gap-2">
                        <button onClick={() => toggleTask(task.id, task.isCompleted)} className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${task.isCompleted ? "bg-green-500 border-green-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700"}`}>
                          {task.isCompleted ? "✓ 完了" : "完了にする"}
                        </button>
                        <button onClick={() => deleteTask(task.id)} className="text-xs px-2 py-1.5 text-zinc-400 hover:text-red-500 transition">削除</button>
                      </div>
                    )}
                    {task.userId !== user.uid && task.isCompleted && (
                       <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">達成済</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}