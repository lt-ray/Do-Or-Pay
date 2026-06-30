"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
// カレンダー用のインポート（ファイルの冒頭に追加）
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const getCurrentTime = () => new Date().getTime();

type Task = {
  id: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  title: string;
  importance: number;
  deadline: number | string;
  isCompleted: boolean;
  completedAt?: number | null;
  createdAt: number;
};

type NotificationPayload = {
  action: "task-created" | "task-completed";
  taskId: string;
  title: string;
  dueAt?: string;
  createdBy?: string;
  completedBy?: string;
};

async function sendNotification(payload: NotificationPayload) {
  const url = process.env.NEXT_PUBLIC_NOTIFY_API_URL;
  const publicToken =
    process.env.NEXT_PUBLIC_NOTIFY_TOKEN ??
    process.env.NEXT_PUBLIC_NOTIFY_SECRET;

  if (!url || !publicToken) {
    console.warn("通知設定が不足しています。");
    return;
  }

  let endpoint: URL;

  try {
    endpoint = new URL(url);
  } catch {
    console.warn("通知URLが正しくありません。");
    return;
  }

  const body = JSON.stringify({
    ...payload,
    token: publicToken,
    secret: publicToken,
  });
  const method = process.env.NEXT_PUBLIC_NOTIFY_METHOD ?? "GET";

  try {
    if (method === "POST" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        endpoint.toString(),
        new Blob([body], { type: "application/json" }),
      );
      if (sent) return;
    }

    if (method === "POST") {
      await fetch(endpoint.toString(), {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body,
      });
      return;
    }

    endpoint.searchParams.set("payload", body);

    await new Promise<void>((resolve) => {
      const img = new Image();

      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = endpoint.toString();

      setTimeout(() => resolve(), 3000);
    });
  } catch (error) {
    console.error("通知送信エラー:", error);
  }
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [globalTasks, setGlobalTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"tasks" | "calendar"| "stats">("tasks");

  // ★新機能: 選択したユーザーのIDを保持するステート
  const [selectedFilterUserId, setSelectedFilterUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState(3); // 初期値は星3つ
  const [deadlineInput, setDeadlineInput] = useState(""); // ユーザーが入力する期限用
  const [user, setUser] = useState<User | null>(null);
  
  const [now, setNow] = useState(getCurrentTime);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(getCurrentTime()), 1000);
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
  if (!title || !user || !deadlineInput) return;

  try {
    const createdAt = getCurrentTime();
    const deadlineTime = new Date(deadlineInput).getTime();

    if (!Number.isFinite(deadlineTime)) return;

    const dueAt = new Date(deadlineTime).toISOString();

    const docRef = await addDoc(collection(db, "tasks"), {
      userId: user.uid,
      userName: user.displayName || "匿名ユーザー",
      userPhoto: user.photoURL || "",
      title,
      importance,
      deadline: deadlineTime,
      isCompleted: false,
      createdAt,
    });

    await sendNotification({
      action: "task-created",
      taskId: docRef.id,
      title,
      dueAt,
      createdBy: user.displayName || user.email || "匿名ユーザー",
    });

    setTitle("");
    setDeadlineInput("");
  } catch (error) {
    console.error("タスク追加エラー:", error);
  }
};

  const toggleTask = async (task: Task) => {
  const isNowCompleted = !task.isCompleted;
  const completedAt = getCurrentTime();

  await updateDoc(doc(db, "tasks", task.id), {
    isCompleted: isNowCompleted,
    completedAt: isNowCompleted ? completedAt : null,
  });

  if (isNowCompleted) {
    const deadlineTime =
      typeof task.deadline === "string"
        ? new Date(task.deadline).getTime()
        : task.deadline;

    await sendNotification({
      action: "task-completed",
      taskId: task.id,
      title: task.title,
      dueAt: new Date(deadlineTime).toISOString(),
      completedBy: user?.displayName || user?.email || "匿名ユーザー",
    });
  }
};

  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, "tasks", id));
  };

  // 1. 再スケジュール（期限をリセットして更新）
  const rescheduleTask = async (id: string) => {
    const updatedAt = getCurrentTime();
    const newDeadline = updatedAt + 24 * 60 * 60 * 1000; // とりあえず24時間延長の例
    // もしユーザーにその場で選ばせたい場合は、入力欄を出す処理に繋げます
    await updateDoc(doc(db, "tasks", id), {
      deadline: newDeadline,
      isCompleted: false,
      completedAt: null,
      createdAt: updatedAt, // 並び順を最新にするため
    });
  };

  // 2. キャンセル（タスクを削除）
  const cancelTask = async (id: string) => {
    if (confirm("このタスクを諦めて削除しますか？")) {
      await deleteDoc(doc(db, "tasks", id));
    }
  };

  const getTaskStatusInfo = (task: Task) => {
    if (task.isCompleted) return { text: "🎉 達成済み", color: "text-zinc-500", status: "completed" };

    const targetTime = typeof task.deadline === "string" ? new Date(task.deadline).getTime() : task.deadline;
    const diff = targetTime - now;

    if (diff <= 0) {
      return { text: "⚠️ 期限切れ", color: "text-red-600 font-bold", status: "failed" };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, "0");
    const seconds = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, "0");
    const color = diff < 1000 * 60 * 60 ? "text-red-500 font-bold" : "text-blue-500 font-medium";

    return { text: `残り ${hours}:${minutes}:${seconds}`, color, status: "active" };
  };

  // 合計スコア（未達成タスクの重要度合計）を計算
  const totalImportanceScore = tasks
    .filter(t => !t.isCompleted)
    .reduce((sum, task) => sum + (task.importance || 0), 0);

    if (!user) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4 text-black dark:bg-black dark:text-white">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Do-Or-Pay</h1>
          <button onClick={handleLogin} className="w-full max-w-xs rounded-full bg-black px-6 py-3 font-bold text-white transition hover:opacity-80 dark:bg-white dark:text-black">
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
  // フィルターの適用
const displayTasks = (
    // 1. まず「誰のタスクを表示するか」で絞り込む
    selectedFilterUserId 
      ? globalTasks.filter(t => t.userId === selectedFilterUserId) 
      : globalTasks
  ).filter(task => {
    // 2. 次に「24時間以内に完了したか、あるいは未完了か」で絞り込む
    
    // 未完了のタスクは常に表示
    if (!task.isCompleted) return true;

    // 以前のデータで completedAt がない場合は、消えなくなってしまうのを防ぐため表示
    if (!task.completedAt) return true;

    // 24時間をミリ秒で計算
    const hours24 = 86400000; 
    
    // 完了した時刻から現在までが24時間以内であれば表示、それ以上なら非表示
    return now - (task.completedAt as number) < hours24;
  });

  const renderCalendarView = () => {
    // ★1. 修正：カレンダーの表示対象ユーザーを判定（統計タブと同じロジック）
    const targetTasks = selectedFilterUserId 
      ? globalTasks.filter(t => t.userId === selectedFilterUserId) 
      : tasks;

    // ★2. 修正：選択された日のタスク抽出ロジック（ハイブリッド方式）
    const selectedDayTasks = selectedDate 
      ? targetTasks.filter(t => {
          const targetDate = t.isCompleted && t.completedAt 
            ? new Date(t.completedAt)  // 完了済みなら完了日
            : new Date(t.deadline);    // 未完了なら締切日
          
          return (
            targetDate.getFullYear() === selectedDate.getFullYear() &&
            targetDate.getMonth() === selectedDate.getMonth() &&
            targetDate.getDate() === selectedDate.getDate()
          );
        })
      : [];

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <h2 className="text-xl font-bold mb-4">アクティビティログ</h2>
          <Calendar
            className="w-full border-none font-sans"
            onClickDay={(value) => setSelectedDate(value)} // ★追加：クリックで日付をセット
            tileContent={({ date, view }) => {
              if (view !== 'month') return null;
              // ★3. 修正：カレンダー上のドット表示ロジック（ハイブリッド方式）
              const dayTasks = targetTasks.filter(t => {
                const targetDate = t.isCompleted && t.completedAt 
                  ? new Date(t.completedAt)  // 完了済みなら完了日
                  : new Date(t.deadline);    // 未完了なら締切日

                return (
                  targetDate.getFullYear() === date.getFullYear() &&
                  targetDate.getMonth() === date.getMonth() &&
                  targetDate.getDate() === date.getDate()
                );
              });
              if (dayTasks.length === 0) return null;
              return (
                <div className="flex justify-center gap-1 mt-1">
                  {dayTasks.map(t => (
                    <div key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.isCompleted ? 'bg-green-500' : 'bg-red-500'}`} />
                  ))}
                </div>
              );
            }}
          />
        </div>

        {/* ★追加：選択された日の詳細表示エリア */}
        {selectedDate && (
          <div className="animate-in fade-in slide-in-from-top-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold sm:text-lg">
                {selectedDate.toLocaleDateString('ja-JP')} のタスク
              </h3>
              <button 
                onClick={() => setSelectedDate(null)}
                className="text-xs text-zinc-500 hover:text-black dark:hover:text-white"
              >
                閉じる
              </button>
            </div>

            {selectedDayTasks.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">この日のタスクはありません。</p>
            ) : (
              <div className="space-y-3">
                {selectedDayTasks.map(task => (
                  <div key={task.id} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <div className="min-w-0">
                      <p className={`break-words text-sm font-medium ${task.isCompleted ? 'line-through text-zinc-400' : ''}`}>
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="text-xs text-zinc-500">{"⭐️".repeat(task.importance)}</span>
                        <span className={`text-xs font-bold ${task.isCompleted ? 'text-green-600' : 'text-red-600'}`}>
                          {task.isCompleted ? "達成済" : "未達成"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStatsView = () => {
    // 現在フィルターされている対象のタスク（全履歴）を使用
    const targetTasks = selectedFilterUserId 
      ? globalTasks.filter(t => t.userId === selectedFilterUserId) 
      : tasks; // 全員表示の時は自分の統計を出すのが自然

    const completedTasks = targetTasks.filter(t => t.isCompleted);
    const totalStars = completedTasks.reduce((sum, t) => {
      // importance が存在しない、または数字でない場合に 0 を使う
      const val = typeof t.importance === 'number' ? t.importance : 0;
      return sum + val;
    }, 0);
    const totalCount = targetTasks.length;
    const achievementRate = totalCount > 0 ? Math.round((completedTasks.length / totalCount) * 100) : 0;

    // 重要度別の統計
    const importanceStats = [1, 2, 3, 4, 5].map(level => {
      const levelTasks = targetTasks.filter(t => (t.importance || 0) === level); // || 0 を追加
      const levelCompleted = levelTasks.filter(t => t.isCompleted);
      const rate = levelTasks.length > 0 ? Math.round((levelCompleted.length / levelTasks.length) * 100) : 0;
      return { level, rate, count: levelTasks.length, completed: levelCompleted.length };
    });

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        {/* 概要カード */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-950/20 sm:p-6">
            <p className="text-amber-800 dark:text-amber-400 text-xs font-bold mb-1">累計獲得スター</p>
            <p className="text-3xl font-black text-amber-600 dark:text-amber-500 sm:text-4xl">
              {totalStars} <span className="text-2xl">⭐️</span>
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-900 dark:bg-emerald-950/20 sm:p-6">
            <p className="text-emerald-800 dark:text-emerald-400 text-xs font-bold mb-1">全体達成率</p>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 sm:text-4xl">
              {achievementRate}<span className="text-2xl">%</span>
            </p>
          </div>
        </div>

        {/* 重要度別の内訳 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <h3 className="font-bold mb-4 text-sm text-zinc-500 uppercase tracking-wider">重要度別クリア率</h3>
          <div className="space-y-5">
            {importanceStats.map(stat => (
              <div key={stat.level}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span className="font-medium">{"⭐️".repeat(stat.level)}</span>
                  <span className="font-mono text-zinc-500">
                    {stat.completed} / {stat.count} ({stat.rate}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-zinc-800 dark:bg-zinc-200 h-full transition-all duration-1000 ease-out" 
                    style={{ width: `${stat.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-zinc-400">
            全 {totalCount} 件のコミットに基づく統計データ
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 font-sans text-black dark:bg-black dark:text-white sm:p-8">
      <main className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Do-Or-Pay</h1>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            {user.photoURL && <img src={user.photoURL} alt="アイコン" className="w-10 h-10 rounded-full border border-zinc-300 dark:border-zinc-700" />}
            <button onClick={handleLogout} className="text-sm px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">ログアウト</button>
          </div>
        </header>

        {/* サマリーカード: 未達成タスクの重要度スコアを表示 */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-950/20 sm:p-6">
          <h2 className="text-amber-800 dark:text-amber-400 font-bold text-sm mb-1">未達成の重要度合計</h2>
          <div className="flex items-center justify-center gap-2">
            <p className="font-mono text-4xl font-black text-amber-600 dark:text-amber-500">
              {totalImportanceScore}
            </p>
            <span className="text-2xl">⭐️</span>
          </div>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/50 mt-2">
            これだけの期待（重み）を背負っています
          </p>
        </div>

        <form onSubmit={addTask} className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
          <div>
            <label className="block text-sm font-medium mb-1">達成する目標</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border p-2 dark:border-zinc-700 dark:bg-zinc-800" />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="sm:w-56">
              <label className="block text-sm font-medium mb-2">重要度を選択</label>
              <div className="mb-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button" // form送信を防ぐため必須
                    onClick={() => setImportance(num)}
                    className="text-2xl transition-transform active:scale-125"
                  >
                    <span className={num <= importance ? "grayscale-0" : "grayscale opacity-30"}>
                      ⭐️
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 font-medium">レベル {importance}: {
                importance === 1 ? "ちょっとしたこと" :
                importance === 3 ? "忘れてはいけない" :
                importance === 5 ? "絶対に成し遂げる" : ""
              }</p>
            </div>
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium mb-1">期限</label>
              <input 
                type="datetime-local" 
                value={deadlineInput} 
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="w-full rounded-md border p-2 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
          
          <button type="submit" className="rounded-md bg-black p-2 font-semibold text-white transition hover:opacity-80 dark:bg-white dark:text-black">
            コミットする
          </button>
        </form>

        <div className="space-y-4">
          <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-zinc-200 p-1 dark:bg-zinc-800 sm:flex sm:w-fit sm:gap-2">
            <button 
              onClick={() => setViewMode("tasks")} 
              className={`rounded-md px-3 py-2 text-sm font-bold transition sm:px-4 ${viewMode === "tasks" ? "bg-white shadow-sm dark:bg-zinc-600" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}
            >
              タスク
            </button>
            <button 
              onClick={() => setViewMode("calendar")} 
              className={`rounded-md px-3 py-2 text-sm font-bold transition sm:px-4 ${viewMode === "calendar" ? "bg-white shadow-sm dark:bg-zinc-600 dark:text-white" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}
            >
              カレンダー
            </button>
            <button 
              onClick={() => setViewMode("stats")} 
              className={`rounded-md px-3 py-2 text-sm font-bold transition sm:px-4 ${viewMode === "stats" ? "bg-white text-black shadow-sm dark:bg-zinc-600 dark:text-white" : "text-zinc-500 hover:text-black dark:hover:text-white"}`}
            >
              統計
            </button>
          </div>

          {/* ★新機能: ユーザー絞り込みフィルターUI（みんなのタスク選択時のみ表示） */}
          
          {viewMode === "tasks" && (
            <div className="scrollbar-hide flex gap-2 overflow-x-auto py-2 sm:gap-3">
              {/* 1. 全員表示ボタン */}
              <button
                onClick={() => setSelectedFilterUserId(null)}
                className={`flex-shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${selectedFilterUserId === null ? "bg-black text-white dark:bg-white dark:text-black" : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"}`}
              >
                🌏 全員
              </button>

              {/* 2. 自分専用ボタン（固定） */}
              <button
                onClick={() => setSelectedFilterUserId(user.uid)}
                className={`flex-shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${selectedFilterUserId === user.uid ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"}`}
              >
                👤 自分
              </button>

              {/* 3. 他のユーザーたち（自分以外をループ） */}
              {activeUsers.filter(u => u.userId !== user.uid).map(u => (
                <button
                  key={u.userId}
                  onClick={() => setSelectedFilterUserId(u.userId)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${selectedFilterUserId === u.userId ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"}`}
                >
                  {u.userPhoto ? (
                    <img src={u.userPhoto} alt="User" className="w-4 h-4 rounded-full" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                  )}
                  {u.userName.split(" ")[0]}
                </button>
              ))}
            </div>
          )}

          {/* 1. viewMode が calendar の時はカレンダーを表示 */}
          {viewMode === "calendar" ? (
            renderCalendarView()
          ): viewMode === "stats" ? ( // ★追加
            renderStatsView()
          )  : (displayTasks.length === 0 ? (
            <p className="text-zinc-500 text-sm italic text-center py-8">
              {selectedFilterUserId ? "このユーザーのタスクはありません。" : "タスクはありません。"}
            </p>
          ) : (
            <div className="grid gap-3">
              {displayTasks.map((task) => {
                const statusInfo = getTaskStatusInfo(task);
                const isOwner = task.userId === user.uid;

                return (
                  <div key={task.id} className={`flex flex-col gap-4 rounded-lg border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${task.isCompleted ? "border-zinc-200 bg-zinc-100 opacity-60 dark:border-zinc-800 dark:bg-zinc-900" : "border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"}`}>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {task.userPhoto ? (
                          <img src={task.userPhoto} alt="User" className="w-5 h-5 rounded-full" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                        )}
                        <span className="text-xs text-zinc-500 font-medium">{task.userName || "名無しユーザー"}</span>
                      </div>

                      <p className={`break-words font-medium ${task.isCompleted ? "line-through text-zinc-500" : ""}`}>{task.title}</p>
                      
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4">
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          重要度: {"⭐️".repeat(task.importance)}
                        </span>
                        <span className={`text-sm font-mono ${statusInfo.color}`}>
                          {statusInfo.text}
                        </span>
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
                      {isOwner && statusInfo.status === "active" && (
                        <>
                          <button onClick={() => toggleTask(task)} className="flex-1 rounded-full border border-zinc-300 px-3 py-2 text-xs font-bold transition hover:bg-zinc-100 sm:flex-none sm:py-1.5">完了にする</button>
                          <button onClick={() => deleteTask(task.id)} className="rounded-full px-3 py-2 text-xs text-zinc-400 transition hover:text-red-500 sm:px-2 sm:py-1.5">削除</button>
                        </>
                      )}
                      {isOwner && statusInfo.status === "completed" && (
                        <button onClick={() => toggleTask(task)} className="flex-1 rounded-full border border-green-500 bg-green-500 px-3 py-2 text-xs font-bold text-white transition sm:flex-none sm:py-1.5">✓ 完了</button>
                      )}
                      {isOwner && statusInfo.status === "failed" && (
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                          {/* 再スケジュールボタン */}
                          <button 
                            onClick={() => rescheduleTask(task.id)} 
                            className="rounded-full border bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 sm:py-1.5"
                          >
                            ⏳ 再スケジュール
                          </button>

                          {/* キャンセルボタン */}
                          <button 
                            onClick={() => cancelTask(task.id)} 
                            className="rounded-full border border-red-300 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 sm:py-1.5"
                          >
                            ❌ キャンセル
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
