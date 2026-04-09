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
  deadline: number | string;
  isCompleted: boolean;
  paymentStatus?: "unpaid" | "pending" | "paid";
  createdAt: number;
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"personal" | "global">("personal");
  
  // ★新機能: 選択したユーザーのIDを保持するステート
  const [selectedFilterUserId, setSelectedFilterUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [penalty, setPenalty] = useState(500);
  const [user, setUser] = useState<User | null>(null);
  
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
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

        const globalQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"), limit(50)); // 少し多めに取得
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
        deadline: Date.now() + 24 * 60 * 60 * 1000, 
        isCompleted: false,
        paymentStatus: "unpaid",
        createdAt: Date.now(),
      });
      setTitle("");
    } catch (error) {
      console.error("タスク追加エラー:", error);
    }
  };

  const toggleTask = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, "tasks", id), { isCompleted: !currentStatus });
  };

  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, "tasks", id));
  };

  const reportPayment = async (id: string) => {
    await updateDoc(doc(db, "tasks", id), { paymentStatus: "pending" });
  };

  const approvePayment = async (id: string) => {
    await updateDoc(doc(db, "tasks", id), { paymentStatus: "paid" });
  };

  const getTaskStatusInfo = (task: Task) => {
    if (task.paymentStatus === "paid") return { text: "💸 支払い完了（承認済）", color: "text-green-600 font-bold", status: "paid" };
    if (task.paymentStatus === "pending") return { text: "⏳ 支払い承認待ち", color: "text-orange-500 font-bold animate-pulse", status: "pending" };
    if (task.isCompleted) return { text: "🎉 達成済み", color: "text-zinc-500", status: "completed" };

    const targetTime = typeof task.deadline === "string" ? new Date(task.deadline).getTime() : task.deadline;
    const diff = targetTime - now;

    if (diff <= 0) {
      return { text: "⚠️ 期限切れ (未払い)", color: "text-red-600 font-bold", status: "failed" };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, "0");
    const seconds = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, "0");
    const color = diff < 1000 * 60 * 60 ? "text-red-500 font-bold" : "text-blue-500 font-medium";

    return { text: `残り ${hours}:${minutes}:${seconds}`, color, status: "active" };
  };

  const totalPenaltyAmount = tasks.reduce((sum, task) => {
    const statusInfo = getTaskStatusInfo(task);
    if ((statusInfo.status === "failed" || statusInfo.status === "pending") && task.paymentStatus !== "paid") {
      return sum + task.penalty;
    }
    return sum;
  }, 0);

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

  // ★新機能: グローバルタスクからユニークなユーザー一覧を抽出
  const uniqueUsersMap = new Map();
  globalTasks.forEach(task => {
    if (!uniqueUsersMap.has(task.userId)) {
      uniqueUsersMap.set(task.userId, {
        userId: task.userId,
        userName: task.userName || "名無しユーザー",
        userPhoto: task.userPhoto
      });
    }
  });
  const activeUsers = Array.from(uniqueUsersMap.values());

  // ★新機能: フィルターの適用
  const displayTasks = viewMode === "personal" 
    ? tasks 
    : (selectedFilterUserId ? globalTasks.filter(t => t.userId === selectedFilterUserId) : globalTasks);

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

        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-6 text-center">
          <h2 className="text-red-800 dark:text-red-400 font-bold text-sm mb-1">あなたが支払うべき罰金合計</h2>
          <p className="text-4xl font-mono font-black text-red-600 dark:text-red-500">
            ¥ {totalPenaltyAmount.toLocaleString()}
          </p>
        </div>

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
            <button 
              onClick={() => { setViewMode("personal"); setSelectedFilterUserId(null); }} 
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

          {/* ★新機能: ユーザー絞り込みフィルターUI（みんなのタスク選択時のみ表示） */}
          {viewMode === "global" && activeUsers.length > 0 && (
            <div className="flex gap-3 overflow-x-auto py-2 scrollbar-hide">
              <button
                onClick={() => setSelectedFilterUserId(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition border ${selectedFilterUserId === null ? "bg-black text-white dark:bg-white dark:text-black" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"}`}
              >
                全員表示
              </button>
              {activeUsers.map(u => (
                <button
                  key={u.userId}
                  onClick={() => setSelectedFilterUserId(u.userId)}
                  className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition border ${selectedFilterUserId === u.userId ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"}`}
                >
                  {u.userPhoto ? (
                    <img src={u.userPhoto} alt="User" className="w-4 h-4 rounded-full" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                  )}
                  {u.userName.split(" ")[0] /* 名前が長い場合は短縮 */}
                </button>
              ))}
            </div>
          )}

          {displayTasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">
              {selectedFilterUserId ? "このユーザーのタスクはありません。" : "タスクはありません。"}
            </p>
          ) : (
            <div className="grid gap-3">
              {displayTasks.map((task) => {
                const statusInfo = getTaskStatusInfo(task);
                const isOwner = task.userId === user.uid;

                return (
                  <div key={task.id} className={`p-4 rounded-lg border flex justify-between items-center transition-all ${task.isCompleted || statusInfo.status === "paid" ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"}`}>
                    
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
                        <span className={`text-sm font-mono ${statusInfo.color}`}>
                          {statusInfo.text}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isOwner && statusInfo.status === "active" && (
                        <>
                          <button onClick={() => toggleTask(task.id, task.isCompleted)} className="text-xs px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 font-bold transition">完了にする</button>
                          <button onClick={() => deleteTask(task.id)} className="text-xs px-2 py-1.5 text-zinc-400 hover:text-red-500 transition">削除</button>
                        </>
                      )}
                      {isOwner && statusInfo.status === "completed" && (
                        <button onClick={() => toggleTask(task.id, task.isCompleted)} className="text-xs px-3 py-1.5 rounded-full border bg-green-500 border-green-500 text-white font-bold transition">✓ 完了</button>
                      )}
                      {isOwner && statusInfo.status === "failed" && (
                        <button onClick={() => reportPayment(task.id)} className="text-xs px-3 py-1.5 rounded-full border bg-black text-white dark:bg-white dark:text-black font-bold transition hover:opacity-80">
                          💰 支払いを報告
                        </button>
                      )}

                      {!isOwner && statusInfo.status === "pending" && (
                        <button onClick={() => approvePayment(task.id)} className="text-xs px-4 py-2 rounded-full border bg-blue-600 border-blue-600 text-white font-bold transition hover:opacity-80 shadow-md">
                          ✅ 支払いを承認する
                        </button>
                      )}
                      
                      {statusInfo.status === "paid" && (
                        <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-800">決済済</span>
                      )}
                    </div>
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