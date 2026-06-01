import { HelpCircle, MessageSquare, Book, Video, Github } from 'lucide-react'

const helpTopics = [
  {
    icon: Book,
    title: 'Getting Started',
    description: 'Learn the basics of using AugmentorAI for interview practice.',
    link: '#',
  },
  {
    icon: Video,
    title: 'Video Tutorials',
    description: 'Watch step-by-step guides on all features.',
    link: '#',
  },
  {
    icon: MessageSquare,
    title: 'FAQs',
    description: 'Find answers to commonly asked questions.',
    link: '#',
  },
  {
    icon: Github,
    title: 'GitHub',
    description: 'View source code and report issues.',
    link: '#',
  },
]

const faqs = [
  {
    question: 'How does AugmentorAI work?',
    answer: 'AugmentorAI uses speech-to-text to transcribe audio in real-time, detects questions, and uses local AI models to generate contextual answer suggestions based on your resume and documents.',
  },
  {
    question: 'Is my data private?',
    answer: 'Yes! AugmentorAI is local-first. All processing happens on your machine. Your resume, documents, and session data never leave your computer.',
  },
  {
    question: 'What AI models does it support?',
    answer: 'AugmentorAI works with Ollama for local LLM inference. You can use models like Llama 3.1, Mistral, Qwen, and more.',
  },
  {
    question: 'How does audio input work?',
    answer: 'The current app listens through your selected microphone in the browser during a live session.',
  },
]

export default function Help() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <HelpCircle className="text-gray-400" size={24} />
        <h1 className="text-2xl font-semibold text-gray-900">Get Help</h1>
      </div>

      {/* Help Topics */}
      <div className="grid grid-cols-2 gap-4 mb-12">
        {helpTopics.map((topic) => (
          <a
            key={topic.title}
            href={topic.link}
            className="card hover:border-violet-300 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <topic.icon size={20} className="text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{topic.title}</h3>
                <p className="text-sm text-gray-600">{topic.description}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* FAQs */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
              <h3 className="font-medium text-gray-900 mb-2">{faq.question}</h3>
              <p className="text-gray-600 text-sm">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="mt-8 text-center">
        <p className="text-gray-600 mb-4">Still need help?</p>
        <div className="flex justify-center gap-4">
          <a href="#" className="btn-secondary">
            <MessageSquare size={18} />
            Contact Support
          </a>
          <a href="#" className="btn-secondary">
            <Github size={18} />
            GitHub Issues
          </a>
        </div>
      </div>
    </div>
  )
}
