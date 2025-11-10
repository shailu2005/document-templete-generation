import React from "react";

export default function A4Template() {
  return (
    <div className="relative bg-white w-[210mm] h-[297mm] mx-auto shadow-lg border border-gray-300 overflow-hidden">
      {/* Watermark */}
      <img
        src="/images/watermark.png"
        alt="Watermark"
        className="absolute inset-0 w-full h-full object-contain opacity-10 z-0 pointer-events-none"
      />

      {/* Header */}
      <img
        src="/images/header.png"
        alt="Header"
        className="absolute top-0 left-0 w-full h-[90px] object-cover z-10"
      />

      {/* Footer */}
      <img
        src="/images/footer.png"
        alt="Footer"
        className="absolute bottom-0 left-0 w-full h-[90px] object-cover z-10"
      />

      {/* Text Content */}
      <div className="relative z-20 px-16 mt-[110px] mb-[110px] text-gray-800">
        <h1 className="text-3xl font-bold text-center mb-6">
          Sample A4 Document Title
        </h1>
        <p className="text-justify text-base leading-relaxed">
          This is an example A4 document layout created using React and Tailwind
          CSS. The header and footer are placed precisely at the top and bottom,
          while a faint watermark image sits behind the content. You can replace
          the placeholder images and text with your actual branding and content.
          This layout can later integrate AI-generated text seamlessly.
        </p>
      </div>
    </div>
  );
}

