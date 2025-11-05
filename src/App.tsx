import { useState, useEffect, useRef } from "react";
import "./App.css";

// Tauri API 声明
declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
    };
  }
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  // 计时相关字段
  inProgress?: boolean; // 进行中状态
  elapsedMs?: number; // 累计耗时（毫秒）
  lastStartAt?: number | null; // 最近一次开始时间戳（毫秒）
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  // 保持已完成任务在列表底部的排序
  const orderTasks = (list: Task[]): Task[] => {
    const incomplete = list.filter(t => !t.completed);
    const complete = list.filter(t => t.completed);
    return [...incomplete, ...complete];
  };

  useEffect(() => {
    // 自动聚焦输入框
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // 加载保存的任务
    loadTasks();


  }, []);

  useEffect(() => {
    // 更新完成状态统计
    const completed = tasks.filter(task => task.completed).length;
    setCompletedCount(completed);
    setTotalCount(tasks.length);
  }, [tasks]);

  // 进行中任务时钟：有进行中任务时每秒触发重渲染以更新耗时显示
  useEffect(() => {
    const hasRunning = tasks.some(t => t.inProgress);
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tasks]);

  const loadTasks = async () => {
    try {
      if (window.__TAURI__?.core?.invoke) {
        const savedTasksJson = await window.__TAURI__.core.invoke("load_tasks");
        if (savedTasksJson) {
          const savedTasks = JSON.parse(savedTasksJson);
          if (savedTasks && Array.isArray(savedTasks)) {
            const normalized: Task[] = savedTasks.map((t: Task) => ({
              ...t,
              inProgress: t.inProgress ?? false,
              elapsedMs: t.elapsedMs ?? 0,
              lastStartAt: t.lastStartAt ?? null,
            }));
            setTasks(orderTasks(normalized));
          }
        }
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    }
  };

  const saveTasks = async (tasksToSave: Task[]): Promise<void> => {
    try {
      if (window.__TAURI__?.core?.invoke) {
        await window.__TAURI__.core.invoke("save_tasks", { payload: { tasks: tasksToSave } });
      }
    } catch (error) {
      console.error("Failed to save tasks:", error);
    }
  };



  const addTask = async () => {
    if (inputValue.trim()) {
      const newTask: Task = {
        id: Date.now().toString(),
        text: inputValue.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
        inProgress: false,
        elapsedMs: 0,
        lastStartAt: null,
      };
      
      const updatedTasks = orderTasks([...tasks, newTask]);
      setTasks(updatedTasks);
      setInputValue("");
      await saveTasks(updatedTasks);
      
      // 保持输入框焦点
      if (inputRef.current) {
        inputRef.current.focus();
      }
      
      // 添加动画效果
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-task-id="${newTask.id}"]`);
        if (taskElement) {
          taskElement.classList.add('just-added');
          setTimeout(() => {
            taskElement.classList.remove('just-added');
          }, 500);
        }
      }, 10);
    }
  };

  const toggleTask = async (taskId: string) => {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    const task = tasks.find(t => t.id === taskId);
    
    if (taskElement && task && !task.completed) {
      taskElement.classList.add('just-completed');
      setTimeout(() => {
        taskElement.classList.remove('just-completed');
      }, 600);
    }
    
    const updatedTasks = tasks.map(t => {
      if (t.id !== taskId) return t;
      const willComplete = !t.completed;
      if (willComplete) {
        let elapsed = t.elapsedMs ?? 0;
        if (t.inProgress && t.lastStartAt) {
          elapsed += Date.now() - t.lastStartAt;
        }
        return { ...t, completed: true, inProgress: false, lastStartAt: null, elapsedMs: elapsed };
      } else {
        // 取消完成状态，不自动重新计时，仅恢复未完成
        return { ...t, completed: false };
      }
    });
    const reordered = orderTasks(updatedTasks);
    setTasks(reordered);
    await saveTasks(reordered);
  };

  const deleteTask = async (taskId: string) => {
    const updatedTasks = tasks.filter(task => task.id !== taskId);
    const reordered = orderTasks(updatedTasks);
    setTasks(reordered);
    await saveTasks(reordered);
  };

  // Ctrl+Delete：清空所有任务
  const clearAllTasks = async () => {
    setTasks([]);
    setSelectedTaskIndex(-1);
    await saveTasks([]);
    inputRef.current?.focus();
  };

  // Enter：开始/继续计时（仅未完成任务）
  const startTask = async (taskId: string) => {
    const updatedTasks = tasks.map(t => {
      if (t.id !== taskId) return t;
      if (t.completed) return t; // 已完成不再计时
      if (t.inProgress) return t; // 已在进行中无需重复处理
      return {
        ...t,
        inProgress: true,
        lastStartAt: Date.now(),
      };
    });
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
  };

  // Space：勾选完成并结算耗时
  const completeTask = async (taskId: string) => {
    const updatedTasks = tasks.map(t => {
      if (t.id !== taskId) return t;
      let elapsed = t.elapsedMs ?? 0;
      if (t.inProgress && t.lastStartAt) {
        elapsed += Date.now() - t.lastStartAt;
      }
      return { ...t, completed: true, inProgress: false, lastStartAt: null, elapsedMs: elapsed };
    });
    const reordered = orderTasks(updatedTasks);
    setTasks(reordered);
    await saveTasks(reordered);
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const getElapsedMs = (task: Task): number => {
    const base = task.elapsedMs ?? 0;
    if (task.inProgress && task.lastStartAt) {
      return base + (now - task.lastStartAt);
    }
    return base;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key === "Delete") {
      e.preventDefault();
      clearAllTasks();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      addTask();
    } else if (e.key === "ArrowDown" && tasks.length > 0) {
      e.preventDefault();
      setSelectedTaskIndex(0);
      taskRefs.current[0]?.focus();
    } else if (e.key === "ArrowUp" && tasks.length > 0) {
      e.preventDefault();
      setSelectedTaskIndex(tasks.length - 1);
      taskRefs.current[tasks.length - 1]?.focus();
    }
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, taskId: string, index: number) => {
    if (e.ctrlKey && e.key === "Delete") {
      e.preventDefault();
      clearAllTasks();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      startTask(taskId);
    } else if (e.key === " ") {
      e.preventDefault();
      completeTask(taskId);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteTask(taskId);
      // 删除后重新聚焦输入框
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          setSelectedTaskIndex(-1);
        }
      }, 10);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < tasks.length - 1) {
        setSelectedTaskIndex(index + 1);
        taskRefs.current[index + 1]?.focus();
      } else {
        setSelectedTaskIndex(-1);
        inputRef.current?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) {
        setSelectedTaskIndex(index - 1);
        taskRefs.current[index - 1]?.focus();
      } else {
        setSelectedTaskIndex(-1);
        inputRef.current?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedTaskIndex(-1);
      inputRef.current?.focus();
    }
  };

  // 全局监听 Ctrl+Delete 清空（确保不论焦点在哪都生效）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
        e.preventDefault();
        clearAllTasks();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tasks]);

  return (
    <div className="app">
      {/* 输入框区域 */}
      <div className="input-container">
        <input
          ref={inputRef}
          type="text"
          className="task-input"
          placeholder="添加新任务..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* 任务列表区域 */}
      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">
          </div>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task.id}
              data-task-id={task.id}
              ref={(el) => {
                taskRefs.current[index] = el;
              }}
              className={`task-item ${task.completed ? "completed" : ""} ${selectedTaskIndex === index ? "focused" : ""}`}
              tabIndex={0}
              onKeyDown={(e) => handleTaskKeyDown(e, task.id, index)}
              onFocus={() => setSelectedTaskIndex(index)}
              onBlur={() => setSelectedTaskIndex(-1)}
            >
              <div
                className={`task-checkbox ${task.completed ? "checked" : ""} ${task.inProgress && !task.completed ? "running" : ""}`}
                onClick={() => toggleTask(task.id)}
              />
              <span className="task-text">{task.text}</span>
              {(task.inProgress || (task.elapsedMs ?? 0) > 0 || task.completed) && (
                <span className="task-time">
                  {formatDuration(getElapsedMs(task))}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部进度条 */}
      <div className="status-bar">
        <div className="progress-text">
          已完成 {completedCount}/{totalCount} ({Math.round(totalCount > 0 ? (completedCount / totalCount) * 100 : 0)}%)
        </div>
        <div className="progress-container">
          <div 
            className="progress-bar" 
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
