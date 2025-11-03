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
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  const loadTasks = async () => {
    try {
      if (window.__TAURI__?.core?.invoke) {
        const savedTasksJson = await window.__TAURI__.core.invoke<string>("load_tasks");
        if (savedTasksJson) {
          const savedTasks = JSON.parse(savedTasksJson);
          if (savedTasks && Array.isArray(savedTasks)) {
            setTasks(savedTasks);
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
      };
      
      const updatedTasks = [...tasks, newTask];
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
    
    const updatedTasks = tasks.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
  };

  const deleteTask = async (taskId: string) => {
    const updatedTasks = tasks.filter(task => task.id !== taskId);
    setTasks(updatedTasks);
    await saveTasks(updatedTasks);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTask(taskId);
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
              ref={(el) => (taskRefs.current[index] = el)}
              className={`task-item ${task.completed ? "completed" : ""} ${selectedTaskIndex === index ? "focused" : ""}`}
              tabIndex={0}
              onKeyDown={(e) => handleTaskKeyDown(e, task.id, index)}
              onFocus={() => setSelectedTaskIndex(index)}
              onBlur={() => setSelectedTaskIndex(-1)}
            >
              <div
                className={`task-checkbox ${task.completed ? "checked" : ""}`}
                onClick={() => toggleTask(task.id)}
              />
              <span className="task-text">{task.text}</span>
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
