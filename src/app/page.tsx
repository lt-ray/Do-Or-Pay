"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
// Firestore用の関数を追加でインポート
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type Task = {
  id: string;
  userId: string; // 誰のタスクか識別するために追加
  title: string;
  penalty: number;
  deadline: string;
  isCompleted: boolean;
  createdAt: number; // 並び替え用に作成日時を追加
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [penalty, setPenalty] = useState(500);
  const [user, setUser] = useState<User | null>(null);

  // 1. ログイン状態の監視と、Firestoreからのデータリアルタイム取得
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // ログイン中のユーザーのタスクだけを取得するクエリ（作成日時順）
        const q = query(
          collection(db, "tasks"),
          where("userId", "==", currentUser.uid),
          orderBy("createdAt", "desc")
        );

        // onSnapshotを使うと、DBが更新されるたびに自動で画面も更新されます
        const unsubscribeDB = onSnapshot(q, (snapshot) => {
          const taskData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Task[];
          setTasks(taskData);
        });

        return () => unsubscribeDB();
      } else {
        // ログアウト時はリストを空にする
        setTasks([]);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("ログインエラー:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

  // 2. タスクをFirestoreに保存する
  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !user) return;

    try {
      await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        title,
        penalty,
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString(),
        isCompleted: false,
        createdAt: Date.now(), // 現在時刻を保存
      });
      setTitle("");
    } catch (error) {
      console.error("タスク追加エラー:", error);
    }
  };

  // 3. Firestore上の完了状態を更新する
  const toggleTask = async (id: string, currentStatus: boolean) => {
    try {
      const taskRef = doc(db, "tasks", id);
      await updateDoc(taskRef, {
        isCompleted: !currentStatus,
      });
    } catch (error) {
      console.error("タスク更新エラー:", error);
    }
  };

  // 4. Firestore上からタスクを削除する
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
        <p className="text-zinc-500 mb-8">目標を達成できなければ、身銭を切る。</p>
        <button onClick={handleLogin} className="bg-black dark:bg-white dark:text-black text-white px-6 py-3 rounded-full font-bold hover:opacity-80 transition">
          Googleでログインして始める
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black text-black dark:text-white font-sans">
      <main className="max-w-2xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Do-Or-Pay</h1>
            <p className="text-zinc-500 text-sm mt-1">ようこそ、{user.displayName}さん</p>
          </div>
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
          <h2 className="text-xl font-semibold">現在のコミットメント</h2>
          {tasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">まだコミットされたタスクはありません。</p>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => (
                <div key={task.id} className={`p-4 rounded-lg border flex justify-between items-center transition-all ${task.isCompleted ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"}`}>
                  <div className="flex-1">
                    <p className={`font-medium ${task.isCompleted ? "line-through text-zinc-500" : ""}`}>{task.title}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-red-500 font-mono font-bold">Penalty: ¥{task.penalty}</span>
                      <span className="text-xs text-zinc-400 font-mono">Limit: {task.deadline}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {/* onClickに現在のステータスも渡すように変更 */}
                    <button onClick={() => toggleTask(task.id, task.isCompleted)} className={`text-xs px-3 py-1.5 rounded-full border transition font-bold ${task.isCompleted ? "bg-green-500 border-green-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700"}`}>
                      {task.isCompleted ? "✓ 完了" : "完了にする"}
                    </button>
                    <button onClick={() => deleteTask(task.id)} className="text-xs px-2 py-1.5 text-zinc-400 hover:text-red-500 transition">削除</button>
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