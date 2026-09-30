import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

export function App() {
  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <header>
        <h1 className="mb-4 text-center text-5xl font-light text-blue-700">todos</h1>
      </header>
      <main className="min-h-16 rounded-lg border border-slate-200 bg-white">
        <TodoFlows />
      </main>
    </div>
  );
}
