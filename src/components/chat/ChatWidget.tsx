'use client';

import { useState } from 'react';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hi! 👋 How can we help with your label today?',
      isBot: true,
    },
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isBot: false,
    };

    setMessages([...messages, userMessage]);
    setInputValue('');

    // Simulate bot response
    setTimeout(() => {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Thanks for your message! We typically respond within a few minutes.',
        isBot: true,
      };
      setMessages((prev) => [...prev, botMessage]);
    }, 1000);
  };

  return (
    <>
      {/* Chat FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-[58px] h-[58px] rounded-full border-none bg-olive text-white cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.25)] flex items-center justify-center transition hover:bg-olive-dark hover:scale-105"
        aria-label="Open chat"
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" className="w-[26px] h-[26px]" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-[26px] h-[26px]" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-[94px] right-6 z-50 w-[340px] max-w-[calc(100vw-48px)] h-[440px] max-h-[calc(100vh-140px)] bg-white border border-line rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.22)] flex flex-col overflow-hidden animate-fade-in-reveal">
          {/* Header */}
          <div className="bg-olive text-white p-[14px_16px] flex items-center justify-between flex-none">
            <div>
              <div className="text-[13px] font-bold">8K Labels Support</div>
              <div className="text-[10.5px] opacity-85 font-normal">Usually replies in a few minutes</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="bg-none border-none text-white text-xl leading-none cursor-pointer p-0 h-6 w-6 flex items-center justify-center"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-cream">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[80%] px-[13px] py-[9px] rounded-[14px] text-[12.5px] leading-[1.45] ${
                  message.isBot
                    ? 'bg-white border border-line text-ink rounded-bl-[3px] self-start'
                    : 'bg-olive text-white rounded-br-[3px] self-end'
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex-none flex gap-2 p-3 border-t border-line bg-white">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Type your message..."
              className="flex-1 border border-line rounded-full py-[9px] px-[14px] text-[12.5px] font-[Hepta_Slab] box-border focus:outline-2 focus:outline-offset-1 focus:outline-olive-light"
            />
            <button
              onClick={handleSendMessage}
              className="flex-none w-9 h-9 rounded-full border-none bg-olive text-white cursor-pointer flex items-center justify-center hover:bg-olive-dark transition"
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16584891 C3.50612381,-0.1 2.40999899,0.0570974035 1.77946707,0.4744748 C0.994623095,1.0574617 0.837654306,2.16346272 1.15159189,2.94894964 L3.03521743,9.389942 C3.03521743,9.54704139 3.19218622,9.70413883 3.50612381,9.70413883 L16.6915026,10.4896257 C16.6915026,10.4896257 17.1624089,10.4896257 17.1624089,9.98514095 L17.1624089,11.1111675 C17.1624089,11.6428216 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
