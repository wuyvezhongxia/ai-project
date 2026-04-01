import './App.scss'
import AiAssistantFloating from './modules/ai/AiAssistantFloating'
import AppRouter from './routes/AppRouter'

function App() {
  return (
    <>
      <AppRouter />
      <AiAssistantFloating />
    </>
  )
}

export default App
