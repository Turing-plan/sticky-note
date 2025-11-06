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
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const taskRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  // 保持已完成任务在列表底部的排序
  const orderTasks = (list: Task[]): Task[] => {
    const incomplete = list.filter(t => !t.completed);
    const complete = list.filter(t => t.completed);
    return [...incomplete, ...complete];
  };

  useEffect(() => {
    // 加载保存的任务
    loadTasks();
  }, []);

  // 新任务弹窗打开时自动聚焦输入
  useEffect(() => {
    if (showNewTask) {
      setTimeout(() => {
        newTaskInputRef.current?.focus();
      }, 10);
    }
  }, [showNewTask]);

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



  const addTaskFromText = async (text: string) => {
    if (text.trim()) {
      const newTask: Task = {
        id: Date.now().toString(),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
        inProgress: false,
        elapsedMs: 0,
        lastStartAt: null,
      };

      const updatedTasks = orderTasks([...tasks, newTask]);
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);

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

      // 自动选中并聚焦新任务
      setSelectedTaskId(newTask.id);
      setTimeout(() => {
        const idx = updatedTasks.findIndex(t => t.id === newTask.id);
        if (idx >= 0) {
          taskRefs.current[idx]?.focus();
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
    // 删除后保持邻近项选中
    setTimeout(() => {
      // 原始索引
      const originalIndex = tasks.findIndex(t => t.id === taskId);
      const nextId = reordered[originalIndex]?.id ?? reordered[originalIndex - 1]?.id ?? null;
      if (nextId) {
        setSelectedTaskId(nextId);
        const idx = reordered.findIndex(t => t.id === nextId);
        if (idx >= 0) taskRefs.current[idx]?.focus();
      } else {
        setSelectedTaskId(null);
      }
    }, 10);
  };

  // Ctrl+Delete：清空所有任务
  const clearAllTasks = async () => {
    setTasks([]);
    setSelectedTaskId(null);
    await saveTasks([]);
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

  // 已移除输入框，因此不再需要其键盘事件处理

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, taskId: string, index: number) => {
    if (e.ctrlKey && e.key === "Delete") {
      e.preventDefault();
      clearAllTasks();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      startTask(taskId);
    } else if (e.code === "Space" || e.key === " " || e.key === "Space" || (e as any).key === "Spacebar") {
      e.preventDefault();
      completeTask(taskId);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteTask(taskId);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (index < tasks.length - 1) {
        const nextIdx = index + 1;
        setSelectedTaskId(tasks[nextIdx].id);
        taskRefs.current[nextIdx]?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (index > 0) {
        const prevIdx = index - 1;
        setSelectedTaskId(tasks[prevIdx].id);
        taskRefs.current[prevIdx]?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSelectedTaskId(null);
    }
  };

  // 全局监听快捷键：Ctrl+Delete 清空、Ctrl+N 新任务、Esc 关闭新任务弹窗、ArrowUp/ArrowDown 列表导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 弹窗打开时仅处理 Esc，避免误触其它全局快捷键
      if (showNewTask) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowNewTask(false);
        }
        return;
      }

      // 输入态不处理全局快捷键
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as any).isContentEditable);
      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
        e.preventDefault();
        clearAllTasks();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setShowNewTask(true);
        return;
      }

      // 若当前已有任务项获得焦点，则交由任务项自身处理，避免双触发造成跳项
      const isTaskFocused = !!ae && ae.classList.contains('task-item');
      if (isTaskFocused) return;

      if (e.key === 'ArrowDown' && tasks.length > 0) {
        e.preventDefault();
        const currentIndex = selectedTaskId ? tasks.findIndex(t => t.id === selectedTaskId) : -1;
        const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, tasks.length - 1);
        setSelectedTaskId(tasks[nextIndex].id);
        setTimeout(() => {
          taskRefs.current[nextIndex]?.focus();
        }, 0);
        return;
      }

      if (e.key === 'ArrowUp' && tasks.length > 0) {
        e.preventDefault();
        const currentIndex = selectedTaskId ? tasks.findIndex(t => t.id === selectedTaskId) : tasks.length;
        const nextIndex = currentIndex < 0 ? tasks.length - 1 : Math.max(currentIndex - 1, 0);
        setSelectedTaskId(tasks[nextIndex].id);
        setTimeout(() => {
          taskRefs.current[nextIndex]?.focus();
        }, 0);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tasks, showNewTask, selectedTaskId]);

  return (
    <div className="app">
      {/* 新任务弹窗：Ctrl+N 打开，Enter 添加，Esc 关闭 */}
      {showNewTask && (
        <div className="overlay" onClick={() => setShowNewTask(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-header">
              <div className="overlay-title">添加新任务</div>
              <button className="overlay-close" onClick={() => setShowNewTask(false)}>×</button>
            </div>
            <input
              ref={newTaskInputRef}
              type="text"
              className="overlay-input"
              placeholder="输入任务名称..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newTaskText.trim()) {
                    addTaskFromText(newTaskText.trim());
                    setNewTaskText("");
                    setShowNewTask(false);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowNewTask(false);
                }
              }}
            />
            <div className="overlay-actions">
              <button className="btn" onClick={() => setShowNewTask(false)}>取消</button>
              <button
                className="btn primary"
                disabled={!newTaskText.trim()}
                onClick={() => {
                  if (newTaskText.trim()) {
                    addTaskFromText(newTaskText.trim());
                    setNewTaskText("");
                    setShowNewTask(false);
                  }
                }}
              >添加</button>
            </div>
            <div className="overlay-footer">快捷键：Ctrl+N 打开，Enter 添加，Esc 关闭</div>
          </div>
        </div>
      )}

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
              className={`task-item ${task.completed ? "completed" : ""} ${selectedTaskId === task.id ? "focused" : ""}`}
              tabIndex={0}
              onKeyDown={(e) => handleTaskKeyDown(e, task.id, index)}
              onFocus={() => setSelectedTaskId(task.id)}
              onBlur={() => {
                // 仅当焦点离开任务列表时才清除选中，避免在任务间跳转时被立即清空
                setTimeout(() => {
                  const el = document.activeElement as HTMLElement | null;
                  const isTaskItem = !!el && el.classList.contains('task-item');
                  if (!isTaskItem) {
                    setSelectedTaskId(null);
                  }
                }, 0);
              }}
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
