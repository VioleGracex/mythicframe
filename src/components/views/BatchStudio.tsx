import React, { useState, useRef, useEffect } from 'react';
import { showInAppAlert, showInAppPrompt } from '../../services/dialogService';
import { BatchItem, BatchVariation, AspectRatio } from '../../types';
import { parseBatchFile } from '../../utils/batchParser';
import { useModalDismiss } from '../../hooks/useModalDismiss';

interface BatchStudioProps {
  engine: any;
}

const Lightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  const { handleBackdropClick } = useModalDismiss(Boolean(url), onClose);
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 md:p-12 animate-in fade-in duration-300"
      onClick={handleBackdropClick}
    >
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center pointer-events-none">
        <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 pointer-events-auto">
          <i className="fa-solid fa-circle-info text-purple-400" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Preview Mode</span>
        </div>
        <button 
          className="w-12 h-12 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500 text-white transition-all shadow-2xl pointer-events-auto border-2 border-white/20 hover:scale-110 active:scale-95"
          onClick={onClose}
          title="Close (Esc)"
        >
          <i className="fa-solid fa-xmark text-xl" />
        </button>
      </div>

      <div className="relative w-full h-full flex items-center justify-center pointer-events-none" onClick={e => e.stopPropagation()}>
        <img 
          src={url} 
          alt="Full Size" 
          className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-[0_0_100px_rgba(168,85,247,0.15)] border border-white/10 pointer-events-auto"
          referrerPolicy="no-referrer"
          onClick={e => e.stopPropagation()}
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-auto">
          <a 
            href={url} 
            download
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-black text-xs flex items-center gap-3 shadow-2xl border border-white/10 transition-all hover:-translate-y-1 active:translate-y-0 uppercase italic tracking-widest"
            onClick={e => e.stopPropagation()}
          >
            <i className="fa-solid fa-download" /> Download Asset
          </a>
          <button 
             onClick={onClose}
             className="px-8 py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full font-black text-xs flex items-center gap-3 shadow-2xl border border-white/10 transition-all uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </div>
      <div className="absolute bottom-4 right-4 text-slate-500 text-[10px] font-medium tracking-tighter">
        Click outside image to close
      </div>
    </div>
  );
};

const BatchItemCard: React.FC<{
  item: BatchItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onRegenerateVariation?: (variation: BatchVariation) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onViewImage?: (url: string) => void;
  onUpdatePrompt?: (newPrompt: string) => void;
  onUpdateSkipReference?: (skip: boolean) => void;
  onUpdateReferenceWeight?: (weight: number) => void;
  onMarkDone?: () => void;
  onUpdateUsedReference?: (url: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ item, isExpanded, onToggleExpand, onToggleEnabled, onRemove, onRetry, onRegenerateVariation, onMoveUp, onMoveDown, onViewImage, onUpdatePrompt, onUpdateSkipReference, onUpdateReferenceWeight, onMarkDone, onUpdateUsedReference, isFirst, isLast }) => {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptValue, setEditPromptValue] = useState(item.prompt);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div 
      className={`flex flex-col rounded-xl border transition-all overflow-hidden ${
        item.status === 'processing' ? 'bg-purple-900/10 border-purple-500/30 shadow-lg shadow-purple-500/5' : 
        item.enabled ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700' : 'bg-slate-950/50 border-slate-900 opacity-60'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center gap-4 p-3">
        <div className="flex flex-col gap-1">
          <button 
            onClick={onMoveUp}
            disabled={isFirst}
            className="w-6 h-4 flex items-center justify-center text-slate-600 hover:text-purple-400 disabled:opacity-0 transition-all"
          >
            <i className="fa-solid fa-caret-up text-xs" />
          </button>
          <button 
            onClick={onMoveDown}
            disabled={isLast}
            className="w-6 h-4 flex items-center justify-center text-slate-600 hover:text-purple-400 disabled:opacity-0 transition-all"
          >
            <i className="fa-solid fa-caret-down text-xs" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleEnabled}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
              item.enabled ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-800 border-slate-700 text-transparent'
            }`}
          >
            <i className="fa-solid fa-check text-[10px]" />
          </button>
          <div 
            className="w-12 h-12 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 group/img relative cursor-pointer"
            onClick={() => item.imageUrl && onViewImage?.(item.imageUrl)}
          >
            {item.imageUrl ? (
              <>
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-0.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                   <span className="text-[6px] font-black text-white truncate block drop-shadow-md tracking-widest text-center opacity-80">
                      IMG
                   </span>
                </div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                    {item.status === 'done' && (
                      <button 
                         onClick={(e) => { e.stopPropagation(); onRetry(); }}
                         className="w-7 h-7 flex items-center justify-center bg-purple-600 text-white rounded-full hover:bg-purple-500 transition-all scale-75 group-hover/img:scale-100 duration-200"
                         title="Regenerate"
                      >
                         <i className="fa-solid fa-wand-magic-sparkles text-[10px]" />
                      </button>
                    )}
                    <button 
                       onClick={(e) => { e.stopPropagation(); item.imageUrl && onViewImage?.(item.imageUrl); }}
                       className="w-7 h-7 flex items-center justify-center bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-all scale-75 group-hover/img:scale-100 duration-200"
                       title="View"
                    >
                      <i className="fa-solid fa-expand text-[10px]" />
                    </button>
                </div>
              </>
            ) : (
              <i className={`fa-solid ${item.status === 'processing' ? 'fa-spinner fa-spin text-purple-500' : 'fa-image opacity-20'}`} />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate pr-2">{item.name}</span>
            <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] font-black text-slate-400 uppercase tracking-tighter">{item.aspectRatio}</span>
            {item.isSeriesTemplate && (
              <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-400 rounded text-[8px] font-black uppercase tracking-wider border border-purple-500/20">Series Data</span>
            )}
            {item.status === 'done' && (
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-circle-check text-green-500 text-[10px]" />
                <button 
                  onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  className="px-2 py-0.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 rounded text-[8px] font-black uppercase flex items-center gap-1 transition-all"
                  title="Regenerate this specific item"
                >
                  <i className="fa-solid fa-wand-magic-sparkles text-[8px]" /> Re-gen
                </button>
              </div>
            )}
            {item.status === 'failed' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 transition-all border border-red-500/30 shadow-lg shadow-red-900/20"
                title="Retry failed generation"
              >
                <i className="fa-solid fa-rotate-right text-[10px]" /> Retry
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">{item.prompt}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-[10px] font-black uppercase tracking-widest ${
              item.isSeriesTemplate ? 'text-purple-400' :
              item.status === 'done' ? 'text-green-400' : 
              item.status === 'processing' ? 'text-purple-400' : 
              item.status === 'failed' ? 'text-red-400' : 'text-slate-600'
            }`}>
              {item.isSeriesTemplate ? 'Template' : item.status}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {item.status === 'pending' && item.imageUrl && onMarkDone && (
              <button 
                onClick={(e) => { e.stopPropagation(); onMarkDone(); }}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-all"
                title="Cancel Retry & Keep Image"
              >
                <i className="fa-solid fa-rotate-left text-sm" />
              </button>
            )}
            <button 
              onClick={onToggleExpand}
              className={`w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all ${isExpanded ? 'rotate-180' : ''}`}
            >
              <i className="fa-solid fa-chevron-down text-xs" />
            </button>
            <button 
              onClick={onRemove}
              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            >
              <i className="fa-solid fa-trash-can text-sm" />
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-800/50 bg-black/20">
          <div className="mt-3 space-y-4">
            {item.imageUrl ? (
              <div className="grid grid-cols-4 gap-2">
                <div 
                  className="col-span-1 aspect-square bg-black/40 rounded-lg border border-slate-800 overflow-hidden group/thumb relative"
                  draggable={true}
                  onDragStart={(e) => {
                    if (item.imageUrl) {
                      e.dataTransfer.setData('text/plain', item.imageUrl);
                      e.dataTransfer.setData('application/mythic-image-url', item.imageUrl);
                    }
                  }}
                >
                  <img src={item.imageUrl} className="w-full h-full object-cover" />
                  <div className="absolute top-0 left-0 right-0 p-1.5 pt-1 pb-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                     <span className="text-[8px] font-black text-white truncate block drop-shadow-md tracking-wider">
                       {item.name.replace(/\[.*\]/g, '').trim()}
                     </span>
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <button 
                      onClick={() => onRetry()}
                      className="text-[9px] font-black text-white bg-purple-600 px-3 py-1 rounded-full uppercase flex items-center gap-1.5 hover:bg-purple-500 transition-all scale-90 group-hover/thumb:scale-100 duration-200"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles" /> Re-gen
                    </button>
                    <button 
                       onClick={() => onViewImage?.(item.imageUrl!)}
                       className="text-[9px] font-black text-slate-300 hover:text-white uppercase"
                    >
                      View
                    </button>
                  </div>
                </div>
                <div className="col-span-3 flex flex-col pt-1 space-y-2">
                   {isEditingPrompt ? (
                      <div className="flex flex-col gap-1">
                        <textarea 
                           className="w-full h-16 bg-slate-900 border border-purple-500/50 rounded text-[10px] text-slate-300 p-2 outline-none resize-none custom-scrollbar"
                           value={editPromptValue}
                           onChange={(e) => setEditPromptValue(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                           <button onClick={() => { setIsEditingPrompt(false); setEditPromptValue(item.prompt); }} className="text-[9px] font-bold text-slate-500 hover:text-slate-300">Cancel</button>
                           <button onClick={() => { onUpdatePrompt?.(editPromptValue); setIsEditingPrompt(false); }} className="text-[9px] font-bold text-purple-400 hover:text-purple-300">Save</button>
                        </div>
                      </div>
                   ) : (
                      <div className="group/prompt relative">
                        <p className="text-[10px] text-slate-400 font-medium line-clamp-3 leading-relaxed italic pr-6 group-hover/prompt:text-slate-300 transition-colors">
                          "{item.prompt}"
                        </p>
                        <button onClick={() => setIsEditingPrompt(true)} className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-slate-600 hover:text-purple-400 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                           <i className="fa-solid fa-pen text-[9px]" />
                        </button>
                      </div>
                   )}
                   
                   <div 
                     className={`mt-2 p-2 border border-dashed rounded-lg relative cursor-pointer group/dropzone transition-all ${
                        isDragOver ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700/50 bg-black/20 hover:bg-black/40 hover:border-purple-500/50'
                     }`}
                     onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                     onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                     onDrop={(e) => {
                       e.preventDefault(); e.stopPropagation();
                       setIsDragOver(false);
                       const url = e.dataTransfer.getData('application/mythic-image-url') || e.dataTransfer.getData('text/plain');
                       if (url && (url.startsWith('blob:') || url.startsWith('data:image/') || url.startsWith('http')) && onUpdateUsedReference) {
                          onUpdateUsedReference(url);
                       } else {
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/') && onUpdateUsedReference) {
                              const reader = new FileReader();
                              reader.onload = () => onUpdateUsedReference(reader.result as string);
                              reader.readAsDataURL(file);
                          }
                       }
                     }}
                     onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                     }}
                   >
                     {/* Hidden file input for native click support */}
                     <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && onUpdateUsedReference) {
                                const reader = new FileReader();
                                reader.onload = () => onUpdateUsedReference(reader.result as string);
                                reader.readAsDataURL(file);
                            }
                        }} 
                     />
                     
                     {item.usedReferenceUrl ? (
                         <div className="flex items-center gap-2 relative z-10 w-full" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Reference:</span>
                            <div className="relative group/ref w-6 h-6 rounded overflow-hidden shadow-md shrink-0 border border-slate-700">
                               <img src={item.usedReferenceUrl} className="w-full h-full object-cover" />
                               {onUpdateSkipReference && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                    <button onClick={() => onUpdateSkipReference(!item.skipReference)} className="text-white hover:text-red-400 transition-colors" title={item.skipReference ? "Include Reference" : "Remove Reference"}>
                                       <i className={`fa-solid ${item.skipReference ? 'fa-plus' : 'fa-xmark'} text-[10px]`} />
                                    </button>
                                  </div>
                               )}
                            </div>
                            {item.skipReference && <span className="text-[8px] font-black text-red-500 uppercase truncate">Excluded <span className="text-slate-500 lowercase font-medium hidden sm:inline">(ignored on regen)</span></span>}
                            {!item.skipReference && onUpdateReferenceWeight && (
                               <div className="flex flex-col flex-1 pl-2" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex items-center justify-between">
                                   <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Weight</span>
                                   <span className="text-[9px] text-purple-400 font-bold">{item.referenceWeight?.toFixed(2) ?? '0.80'}</span>
                                 </div>
                                 <input 
                                   type="range" 
                                   min="0.1" 
                                   max="2.0" 
                                   step="0.05" 
                                   value={item.referenceWeight ?? 0.8}
                                   onChange={(e) => onUpdateReferenceWeight(parseFloat(e.target.value))}
                                   className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                 />
                               </div>
                            )}
                            <div className="flex shrink-0 text-right min-w-0">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); onUpdateUsedReference && onUpdateUsedReference(''); }} 
                                 className="text-[9px] text-slate-500 hover:text-red-400 uppercase font-black"
                               >Remove</button>
                            </div>
                         </div>
                     ) : (
                         <div className="py-2 flex flex-col items-center justify-center pointer-events-none opacity-50 group-hover/dropzone:opacity-100 transition-opacity">
                            <i className="fa-solid fa-image text-slate-500 mb-1" />
                            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Drag or Click to Add Reference</span>
                         </div>
                     )}
                   </div>
                </div>
              </div>
            ) : (
               <div className="space-y-2">
                 {isEditingPrompt ? (
                      <div className="flex flex-col gap-1">
                        <textarea 
                           className="w-full h-16 bg-slate-900 border border-purple-500/50 rounded text-[10px] text-slate-300 p-2 outline-none resize-none custom-scrollbar"
                           value={editPromptValue}
                           onChange={(e) => setEditPromptValue(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                           <button onClick={() => { setIsEditingPrompt(false); setEditPromptValue(item.prompt); }} className="text-[9px] font-bold text-slate-500 hover:text-slate-300">Cancel</button>
                           <button onClick={() => { onUpdatePrompt?.(editPromptValue); setIsEditingPrompt(false); }} className="text-[9px] font-bold text-purple-400 hover:text-purple-300">Save</button>
                        </div>
                      </div>
                   ) : (
                      <div className="p-3 bg-black/40 rounded border border-slate-800 text-[11px] text-slate-300 line-clamp-3 italic group/prompt relative pr-8">
                        {item.prompt}
                        <button onClick={() => setIsEditingPrompt(true)} className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-slate-600 hover:text-purple-400 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                           <i className="fa-solid fa-pen text-[10px]" />
                        </button>
                       </div>
                   )}
                   <div 
                     className={`mt-2 p-2 border border-dashed rounded-lg relative cursor-pointer group/dropzone transition-all ${
                        isDragOver ? 'border-purple-500 bg-purple-500/20' : 'border-slate-700/50 bg-black/20 hover:bg-black/40 hover:border-purple-500/50'
                     }`}
                     onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                     onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                     onDrop={(e) => {
                       e.preventDefault(); e.stopPropagation();
                       setIsDragOver(false);
                       const url = e.dataTransfer.getData('application/mythic-image-url') || e.dataTransfer.getData('text/plain');
                       if (url && (url.startsWith('blob:') || url.startsWith('data:image/') || url.startsWith('http')) && onUpdateUsedReference) {
                          onUpdateUsedReference(url);
                       } else {
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/') && onUpdateUsedReference) {
                              const reader = new FileReader();
                              reader.onload = () => onUpdateUsedReference(reader.result as string);
                              reader.readAsDataURL(file);
                          }
                       }
                     }}
                     onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                     }}
                   >
                     {/* Hidden file input for native click support */}
                     <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && onUpdateUsedReference) {
                                const reader = new FileReader();
                                reader.onload = () => onUpdateUsedReference(reader.result as string);
                                reader.readAsDataURL(file);
                            }
                        }} 
                     />
                     
                     {item.usedReferenceUrl ? (
                         <div className="flex items-center gap-2 relative z-10 w-full" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Reference:</span>
                            <div className="relative group/ref w-6 h-6 rounded overflow-hidden shadow-md shrink-0 border border-slate-700">
                               <img src={item.usedReferenceUrl} className="w-full h-full object-cover" />
                               {onUpdateSkipReference && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                    <button onClick={() => onUpdateSkipReference(!item.skipReference)} className="text-white hover:text-red-400 transition-colors" title={item.skipReference ? "Include Reference" : "Remove Reference"}>
                                       <i className={`fa-solid ${item.skipReference ? 'fa-plus' : 'fa-xmark'} text-[10px]`} />
                                    </button>
                                  </div>
                               )}
                            </div>
                            {item.skipReference && <span className="text-[8px] font-black text-red-500 uppercase truncate">Excluded <span className="text-slate-500 lowercase font-medium hidden sm:inline">(ignored on regen)</span></span>}
                            {!item.skipReference && onUpdateReferenceWeight && (
                               <div className="flex flex-col flex-1 pl-2" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex items-center justify-between">
                                   <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Weight</span>
                                   <span className="text-[9px] text-purple-400 font-bold">{item.referenceWeight?.toFixed(2) ?? '0.80'}</span>
                                 </div>
                                 <input 
                                   type="range" 
                                   min="0.1" 
                                   max="2.0" 
                                   step="0.05" 
                                   value={item.referenceWeight ?? 0.8}
                                   onChange={(e) => onUpdateReferenceWeight(parseFloat(e.target.value))}
                                   className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                 />
                               </div>
                            )}
                            <div className="flex shrink-0 text-right min-w-0">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); onUpdateUsedReference && onUpdateUsedReference(''); }} 
                                 className="text-[9px] text-slate-500 hover:text-red-400 uppercase font-black"
                               >Remove</button>
                            </div>
                         </div>
                     ) : (
                         <div className="py-2 flex flex-col items-center justify-center pointer-events-none opacity-50 group-hover/dropzone:opacity-100 transition-opacity">
                            <i className={`fa-solid fa-image mb-1 ${isDragOver ? 'text-purple-400 animate-bounce' : 'text-slate-500'}`} />
                            <span className={`text-[9px] uppercase font-bold tracking-wider ${isDragOver ? 'text-purple-300' : 'text-slate-400'}`}>
                               {isDragOver ? 'Drop Image Here' : 'Drag or Click to Add Reference'}
                            </span>
                         </div>
                     )}
                   </div>
               </div>
            )}
            
            {item.error && (
              <div className="p-3 bg-red-900/10 border border-red-900/20 rounded text-[10px] text-red-400 flex items-start gap-2">
                <i className="fa-solid fa-triangle-exclamation mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold uppercase tracking-widest text-[8px] mb-1">Execution Error</p>
                  <span>{item.error}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const BatchStudio: React.FC<BatchStudioProps> = ({ engine }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showInstructions, setShowInstructions] = useState(() => {
    const saved = localStorage.getItem('mythic_batch_instructions');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [minimizedFiles, setMinimizedFiles] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [quickAddText, setQuickAddText] = useState("");
  const { activeTab, updateActiveTab, handleGenerate, isGenerating, statusMessage, reorderBatchItem } = engine;
  const queue = activeTab.batchQueue || [];

  const { handleBackdropClick: handleInterventionBackdropClick } = useModalDismiss(
    Boolean(engine.batchIntervention), 
    () => engine.batchIntervention?.resolve({ action: 'abort' })
  );

  const handleQuickAdd = () => {
    if (!quickAddText.trim()) return;
    const items = parseBatchFile(quickAddText, 'Quick Add');
    // Force them to be active items (not series templates) even if 2 columns
    const activeItems = items.map(item => ({
      ...item,
      enabled: true,
      isSeriesTemplate: false,
      aspectRatio: '1:1' as AspectRatio
    }));
    
    updateActiveTab((prev: any) => ({
      batchQueue: [...(prev.batchQueue || []), ...activeItems]
    }));
    setQuickAddText("");
  };

  const toggleItemEnabled = (id: string) => {
    updateActiveTab({
      batchQueue: queue.map((item: BatchItem) => {
        if (item.id === id) {
          return { ...item, enabled: item.isSeriesTemplate ? false : !item.enabled };
        }
        return item;
      })
    });
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    updateActiveTab({
      batchQueue: queue.map((item: BatchItem) => 
        item.id === id ? { ...item, ...updates } : item
      )
    });
  };

  const handleMoveItem = (id: string, direction: 'up' | 'down') => {
    reorderBatchItem(id, direction);
  };

  const toggleAccordion = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (enabled: boolean) => {
    updateActiveTab({
      batchQueue: queue.map((item: BatchItem) => ({ 
          ...item, 
          enabled: item.isSeriesTemplate ? false : enabled 
      }))
    });
  };

  const toggleGroupEnabled = (fileName: string, enabled: boolean) => {
    updateActiveTab({
      batchQueue: queue.map((item: BatchItem) => 
        item.sourceFile === fileName ? { ...item, enabled: item.isSeriesTemplate ? false : enabled } : item
      )
    });
  };

  const templates = queue.filter((i: BatchItem) => i.isSeriesTemplate);
  const activeItems = queue.filter((i: BatchItem) => !i.isSeriesTemplate);
  const pendingItems = activeItems.filter((i: BatchItem) => i.status !== 'done');
  const doneItems = activeItems.filter((i: BatchItem) => i.status === 'done');

  const groupedPending = pendingItems.reduce((acc: Record<string, BatchItem[]>, item: BatchItem) => {
    const group = item.sourceFile || 'Uncategorized';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const groupedTemplates = templates.reduce((acc: Record<string, BatchItem[]>, item: BatchItem) => {
    const group = item.sourceFile || 'Uncategorized';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const processFiles = async (files: FileList) => {
    const allNewItems: BatchItem[] = [];
    
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) continue;
      try {
        const content = await file.text();
        const items = parseBatchFile(content, file.name);
        allNewItems.push(...items);
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err);
      }
    }

    if (allNewItems.length > 0) {
      updateActiveTab((prev: any) => ({
        batchQueue: [...(prev.batchQueue || []), ...allNewItems]
      }));
    }
  };

  const getCoreName = (name: string) => name.split(' [')[0].trim();

    const handleExpandSingleTemplate = (template: BatchItem) => {
    const variations = activeTab.batchVariations || [];
    if (variations.length === 0) return;

    const newItems: BatchItem[] = [];
    const currentQueue = [...queue];

    const coreName = getCoreName(template.name);
    const baseItemIndex = currentQueue.findIndex(i => i.id === template.id);
    if (baseItemIndex !== -1) {
        currentQueue[baseItemIndex] = {
            ...currentQueue[baseItemIndex],
            enabled: false,
            isSeriesTemplate: true
        };
    }

    // Define priority order: Full Body > Waist Up > Chibi > Item > Texture > Icon
    const priorityOrder = ['full-body', 'waist-up', 'chibi', 'item', 'texture', 'icon'];
    const activeVariations = variations
        .filter(v => priorityOrder.includes(v))
        .sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));

    activeVariations.forEach(v => {
        const vSuffix = `[${v.replace('-', ' ').toUpperCase()}]`;
        const expectedName = `${coreName} ${vSuffix}`;
        const alreadyExists = currentQueue.some(i => i.name === expectedName);
        
        if (!alreadyExists) {
            let newPrompt = cleanVariantPrefixes(template.prompt);
            let newRatio = template.aspectRatio;

            const framingKeywords = [
              'waist up', 'full body', 'half body', 'chibi', 'bust', 
              'small body', 'big heads', 'cute characters', 'super deformed', 
              'chibi style', 'deformed style', 'big head', 'small character',
              'cute character', 'highly detailed chibi'
            ];
            framingKeywords.forEach(kw => {
                newPrompt = newPrompt.replace(new RegExp(kw, 'gi'), '');
            });

            if (v === 'chibi') {
                const ratioKeyword = engine.activeTab.chibiConfig?.bodyRatio === '1:1' ? 'huge head and tiny body (1:1 ratio)' : engine.activeTab.chibiConfig?.bodyRatio === '1:4' ? 'taller chibi body (1:4 ratio)' : 'big head and small body';
                const styleKeyword = engine.activeTab.chibiConfig?.headStyle === 'moe' ? 'moe cute face' : 'standard anime face';
                const bodyKeyword = engine.activeTab.chibiConfig?.bodyStyle === 'geometric' ? 'geometric simple body shapes' : 'detailed anatomical chibi body';
                newPrompt = `chibi style, ${ratioKeyword}, ${styleKeyword}, ${bodyKeyword}, super deformed, highly detailed chibi character design, facing left side, looking left, ${newPrompt}`;
                newRatio = '1:1';
            } else if (v === 'waist-up') {
                newPrompt = `Waist-up portrait: the frame MUST cut at the waist. The character is cropped at the hips. Legs, knees, and feet must NOT be visible under any circumstance. Waist-up character portrait for dialogue UI. STRICT framing rules: Crop exactly at the waist (hips level). No legs, knees, or feet visible. Upper body fills most of the frame (60-80%). Head and torso are the focus. Composition: Centered or slightly offset character. Clear silhouette for UI readability. DO NOT: Do not generate full body, Do not zoom out to include legs, Do not keep original full-body proportions. facing left side, looking left, ${newPrompt}`;
                newRatio = '3:4';
            } else if (v === 'full-body') {
                newPrompt = `STRICTLY FULL BODY shot, entire character visible from head to toe, absolute full silhouette, character standing centered in the frame with padding at the top and bottom, head and feet clearly and fully in frame, ensure large weapons and accessories are entirely within frame and not clipped by boundaries, standing on ground, standalone character design, facing left side, looking left, ${newPrompt}`;
                newRatio = '3:4';
            } else if (v === 'item') {
                newPrompt = `isolated object, centered, standalone prop asset, pure solid background, ${newPrompt}`;
                newRatio = '1:1';
            } else if (v === 'texture') {
                newPrompt = `seamless repeating map texture, flat top-down view, uniform lighting, no shadows, no characters, no central object, edge-to-edge tileable seamless pattern, ${newPrompt}`;
                newRatio = '1:1';
            } else if (v === 'icon') {
                newPrompt = `standalone icon asset, centered on a pure solid canvas, clean silhouette, ${newPrompt}`;
                newRatio = '1:1';
            }

            newItems.push({
                ...template,
                id: `batch-${Math.random().toString(36).substr(2, 9)}`,
                name: expectedName,
                prompt: newPrompt.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').trim(),
                aspectRatio: newRatio,
                status: 'pending',
                enabled: true,
                isSeriesTemplate: false,
                imageUrl: undefined,
                error: undefined
            });
        }
    });

    if (newItems.length > 0) {
        updateActiveTab({
            batchQueue: [...currentQueue, ...newItems]
        });
    }
  };

  const handleExpandVariations = () => {
    const variations = activeTab.batchVariations || [];
    if (variations.length === 0) return;

    const newItems: BatchItem[] = [];
    const currentQueue = [...queue];
    
    const uniqueCoreNames = Array.from(new Set(currentQueue.map(i => getCoreName(i.name))));
    const priorityOrder = ['full-body', 'waist-up', 'chibi', 'item', 'texture', 'icon'];
    const activeVariations = variations
        .filter(v => priorityOrder.includes(v))
        .sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));

    uniqueCoreNames.forEach(coreName => {
        const baseItemIndex = currentQueue.findIndex(i => i.name === coreName || getCoreName(i.name) === coreName);
        if (baseItemIndex === -1) return;
        
        const baseItem = currentQueue[baseItemIndex];
        
        // Disable the base item so only the variations are generated
        currentQueue[baseItemIndex] = {
            ...baseItem,
            enabled: false,
            isSeriesTemplate: true
        };

        activeVariations.forEach(v => {
            const vSuffix = `[${v.replace('-', ' ').toUpperCase()}]`;
            const expectedName = `${coreName} ${vSuffix}`;
            const alreadyExists = currentQueue.some(i => i.name === expectedName);
            
            if (!alreadyExists) {
                let newPrompt = cleanVariantPrefixes(baseItem.prompt);
                let newRatio = baseItem.aspectRatio;

                const framingKeywords = [
                  'waist up', 'full body', 'half body', 'chibi', 'bust', 
                  'small body', 'big heads', 'cute characters', 'super deformed', 
                  'chibi style', 'deformed style', 'big head', 'small character',
                  'cute character', 'highly detailed chibi'
                ];
                framingKeywords.forEach(kw => {
                    newPrompt = newPrompt.replace(new RegExp(kw, 'gi'), '');
                });

                if (v === 'chibi') {
                    const ratioKeyword = engine.activeTab.chibiConfig?.bodyRatio === '1:1' ? 'huge head and tiny body (1:1 ratio)' : engine.activeTab.chibiConfig?.bodyRatio === '1:4' ? 'taller chibi body (1:4 ratio)' : 'big head and small body';
                    const styleKeyword = engine.activeTab.chibiConfig?.headStyle === 'moe' ? 'moe cute face' : 'standard anime face';
                    const bodyKeyword = engine.activeTab.chibiConfig?.bodyStyle === 'geometric' ? 'geometric simple body shapes' : 'detailed anatomical chibi body';
                    newPrompt = `chibi style, ${ratioKeyword}, ${styleKeyword}, ${bodyKeyword}, super deformed, highly detailed chibi character design, facing left side, looking left, ${newPrompt}`;
                    newRatio = '1:1';
                } else if (v === 'waist-up') {
                    newPrompt = `Waist-up portrait: the frame MUST cut at the waist. The character is cropped at the hips. Legs, knees, and feet must NOT be visible under any circumstance. Waist-up character portrait for dialogue UI. STRICT framing rules: Crop exactly at the waist (hips level). No legs, knees, or feet visible. Upper body fills most of the frame (60-80%). Head and torso are the focus. Composition: Centered or slightly offset character. Clear silhouette for UI readability. DO NOT: Do not generate full body, Do not zoom out to include legs, Do not keep original full-body proportions. facing left side, looking left, ${newPrompt}`;
                    newRatio = '3:4';
                } else if (v === 'full-body') {
                    newPrompt = `STRICTLY FULL BODY shot, entire character visible from head to toe, absolute full silhouette, character standing centered in the frame with padding at the top and bottom, head and feet clearly and fully in frame, ensure large weapons and accessories are entirely within frame and not clipped by boundaries, standing on ground, standalone character design, facing left side, looking left, ${newPrompt}`;
                    newRatio = '3:4';
                } else if (v === 'item') {
                    newPrompt = `isolated object, centered, standalone prop asset, pure solid background, ${newPrompt}`;
                    newRatio = '1:1';
                } else if (v === 'texture') {
                    newPrompt = `seamless repeating map texture, flat top-down view, uniform lighting, no shadows, no characters, no central object, edge-to-edge tileable seamless pattern, ${newPrompt}`;
                    newRatio = '1:1';
                } else if (v === 'icon') {
                    newPrompt = `standalone icon asset, centered on a pure solid canvas, clean silhouette, ${newPrompt}`;
                    newRatio = '1:1';
                }

                newItems.push({
                    ...baseItem,
                    id: `batch-${Math.random().toString(36).substr(2, 9)}`,
                    name: expectedName,
                    prompt: newPrompt.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').trim(),
                    aspectRatio: newRatio,
                    status: 'pending',
                    enabled: true,
                    isSeriesTemplate: false,
                    imageUrl: undefined,
                    error: undefined
                });
            }
        });
    });

    if (newItems.length > 0) {
        updateActiveTab({
            batchQueue: [...currentQueue, ...newItems]
        });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) processFiles(files);
  };

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const exportSettingsAndQueue = () => {
    const data = {
       batchQueue: queue,
       selectedStyleId: activeTab.selectedStyleId,
       bgConfig: activeTab.bgConfig,
       chibiConfig: activeTab.chibiConfig,
       batchGenerationMode: activeTab.batchGenerationMode,
       referenceAssets: activeTab.referenceAssets
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Batch_Project_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettingsAndQueue = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);
            updateActiveTab({
               batchQueue: data.batchQueue || [],
               selectedStyleId: data.selectedStyleId || 'none',
               bgConfig: data.bgConfig || engine.bgConfig,
               chibiConfig: data.chibiConfig || engine.chibiConfig,
               batchGenerationMode: data.batchGenerationMode || 'standard',
               referenceAssets: data.referenceAssets || []
            });
        } catch(err) {
            console.error("Failed to parse batch import", err);
            await showInAppAlert("Invalid batch project file.", { isDestructive: true });
        }
        if (importFileInputRef.current) importFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) processFiles(files);
  };

  const handleRemoveItem = (id: string) => {
    updateActiveTab({ batchQueue: queue.filter((item: BatchItem) => item.id !== id) });
  };

  const handleClearQueue = () => {
    updateActiveTab({ batchQueue: [] });
  };

  const handleClearVariations = () => {
    updateActiveTab({ 
      batchQueue: queue.filter((item: BatchItem) => 
        !item.name.includes('[FULL BODY]') && 
        !item.name.includes('[WAIST UP]') && 
        !item.name.includes('[CHIBI]')
      ) 
    });
  };

  const cleanVariantPrefixes = (prompt: string) => {
      let p = prompt.trim();
      p = p.replace(/^STRICTLY FULL BODY shot, entire character visible from head to toe, absolute full silhouette, character standing centered in the frame with padding at the top and bottom, head and feet clearly and fully in frame, ensure large weapons and accessories are entirely within frame and not clipped by boundaries, standing on ground, standalone character design,\s*/i, '');
      p = p.replace(/^ULTRA CLOSE-UP waist-up character portrait, zoomed in framing strictly from the waist up, cutoff at the upper thighs or hips, facial features large and clearly visible, centered composition, ensure the entire head is fully visible and not cut off by edges, standalone character portrait,\s*/i, '');
      p = p.replace(/^Waist-up portrait: the frame MUST cut at the waist\. The character is cropped at the hips\. Legs, knees, and feet must NOT be visible under any circumstance\. Waist-up character portrait for dialogue UI\. STRICT framing rules: Crop exactly at the waist \(hips level\)\. No legs, knees, or feet visible\. Upper body fills most of the frame \(60-80%\)\. Head and torso are the focus\. Composition: Centered or slightly offset character\. Clear silhouette for UI readability\. DO NOT: Do not generate full body, Do not zoom out to include legs, Do not keep original full-body proportions\.\s*/i, '');
      p = p.replace(/^chibi style, .*?, .*?, .*?, super deformed, highly detailed chibi character design,\s*/i, '');
      p = p.replace(/^chibi style, cute character with big head and small body, super deformed, highly detailed chibi character design,\s*/i, '');
      p = p.replace(/^facing left side, looking left,\s*/i, ''); // Clean this up too since it's injected often
      return p;
  };

  const handleRetryItem = (id: string) => {
    updateActiveTab((prev: any) => ({
      batchQueue: prev.batchQueue.map((item: BatchItem) => 
        item.id === id ? { ...item, status: 'pending', error: undefined } : item
      )
    }));
    // Auto-trigger generation if not already running
    setTimeout(() => {
        if (!isGenerating) engine.handleGenerateBatch();
    }, 100);
  };

  const handleMarkDoneItem = (id: string) => {
    updateActiveTab((prev: any) => ({
      batchQueue: prev.batchQueue.map((item: BatchItem) => 
        item.id === id ? { ...item, status: 'done', error: undefined } : item
      )
    }));
  };

  const handleDownloadAll = async () => {
    const doneItems = queue.filter((item: BatchItem) => item.status === 'done' && item.imageUrl);
    if (doneItems.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const item of doneItems) {
      try {
        const response = await fetch(item.imageUrl!);
        const blob = await response.blob();
        
        // Group by core character name (remove tags like [Chibi])
        const coreName = item.name.split(' [')[0].trim().replace(/chibi|full\s*body|waist\s*up/gi, "").trim();
        const safeCharName = coreName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const charFolder = zip.folder(safeCharName);
        
        const styleMatch = item.name.match(/\[(.*?)\]/);
        let prefix = '';
        if (styleMatch) {
            const rawStyle = styleMatch[1].toLowerCase();
            if (rawStyle.includes('waist up') || rawStyle.includes('waist-up')) prefix = 'WaistUp_';
            else if (rawStyle.includes('full body') || rawStyle.includes('full-body')) prefix = 'FullBody_';
            else if (rawStyle.includes('chibi')) prefix = 'Chibi_';
            else prefix = `${styleMatch[1].replace(/[^a-z0-9]/gi, '')}_`;
        }
        
        const cleanItemName = `${prefix}${safeCharName}`;
        const fileName = `${cleanItemName}.png`;
        if (charFolder) {
          charFolder.file(fileName, blob);
        } else {
          zip.file(fileName, blob);
        }
      } catch (error) {
        console.error(`Failed to download ${item.name}:`, error);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    
    // Record in export history
    if (engine.exports?.addExportEntry) {
      await engine.exports.addExportEntry({
        name: `Batch_Export_${new Date().toISOString().slice(0, 10)}.zip`,
        itemCount: doneItems.length,
        fileSize: content.size,
        type: 'zip',
        blob: content
      });
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `Batch_Export_${Date.now()}.zip`;
    link.click();
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const startPanPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning.current && scrollRef.current) {
        e.preventDefault();
        const dx = e.clientX - startPanPos.current.x;
        const dy = e.clientY - startPanPos.current.y;
        scrollRef.current.scrollTop -= dy;
        scrollRef.current.scrollLeft -= dx;
        startPanPos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1 || isPanning.current) {
        isPanning.current = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) { // Middle mouse button
      e.preventDefault();
      isPanning.current = true;
      startPanPos.current = { x: e.clientX, y: e.clientY };
      document.body.style.cursor = 'all-scroll';
    }
  };

  return (
    <div 
      ref={scrollRef}
      onMouseDown={handleMouseDown}
      className={`flex-1 overflow-auto p-8 custom-scrollbar bg-slate-900 transition-colors ${isDragging ? 'bg-purple-900/10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase italic pr-4">Batch Studio</h1>
            <p className="text-slate-400 text-sm font-medium">Generate asset batches from a prompt list.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col items-end px-3 border-r border-slate-800 pr-4">
               <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Mode</span>
               <span className="text-xs font-bold text-white uppercase italic">{activeTab.batchGenerationMode === 'consistent_series' ? 'Series Synthesis' : 'Standard Batch'}</span>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".txt,.csv" 
              multiple
            />
            <input 
              type="file" 
              ref={importFileInputRef} 
              onChange={importSettingsAndQueue} 
              className="hidden" 
              accept=".json" 
            />

            <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800"
                 title="Import plain .txt or .csv list of prompts"
               >
                 <i className="fa-solid fa-file-lines" /> Load TXT
               </button>
               <div className="w-px bg-slate-800 mx-1"></div>
               <button 
                 onClick={() => importFileInputRef.current?.click()}
                 className="px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800"
                 title="Import Batch JSON with Queue + Settings"
               >
                 <i className="fa-solid fa-folder-open" /> Load JSON
               </button>
               <button 
                 onClick={exportSettingsAndQueue}
                 className="px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800"
                 title="Export Batch Queue & current side-bar Settings as JSON"
               >
                 <i className="fa-solid fa-cloud-arrow-down" /> Save JSON
               </button>
            </div>

              <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                <div className="flex flex-col">
                  <div className="flex p-0.5">
                    <button
                      onClick={() => updateActiveTab({ batchGenerationMode: 'standard' })}
                      className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-2 ${activeTab.batchGenerationMode === 'standard' ? 'bg-slate-800 text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Simple Batch: Process each item independently"
                    >
                      <i className="fa-solid fa-layer-group" /> Single
                    </button>
                    <button
                      onClick={() => updateActiveTab({ batchGenerationMode: 'consistent_series' })}
                      className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-2 ${activeTab.batchGenerationMode === 'consistent_series' ? 'bg-purple-600 text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Consistent Series: Use items with same name as character references for each other"
                    >
                      <i className="fa-solid fa-people-group" /> Series
                    </button>
                  </div>
                </div>
              </div>

            {isGenerating && (
              <button
                onClick={engine.isBatchPaused ? engine.handleResumeBatch : engine.handlePauseBatch}
                className={`px-4 py-2 rounded-lg font-black text-sm flex items-center gap-2 transition-all shadow-lg uppercase italic tracking-wider text-white ${
                  engine.isBatchPaused ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20 animate-pulse' : 'bg-slate-700 hover:bg-slate-600 shadow-slate-900/20'
                }`}
                title={engine.isBatchPaused ? "Resume batch queue" : "Pause batch queue after active item finishes"}
              >
                <i className={`fa-solid ${engine.isBatchPaused ? 'fa-play' : 'fa-pause'}`} />
                {engine.isBatchPaused ? 'Resume Queue' : 'Pause Queue'}
              </button>
            )}
            <button 
              onClick={isGenerating ? engine.handleCancel : engine.handleGenerateBatch}
              disabled={!isGenerating && queue.filter((i: BatchItem) => i.status === 'pending' && i.enabled).length === 0}
              className={`px-6 py-2 rounded-lg font-black text-sm flex items-center gap-2 transition-all shadow-lg uppercase italic tracking-wider ${
                isGenerating 
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' 
                  : 'bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-purple-900/20'
              }`}
            >
              <i className={`fa-solid ${isGenerating ? 'fa-stop' : 'fa-wand-magic-sparkles'}`} />
              {isGenerating ? 'Cancel Generation' : (engine.isBatchPaused ? 'Resume Batch' : 'Generate Selected')}
            </button>
            <button 
              onClick={handleDownloadAll}
              disabled={!queue.some((i: BatchItem) => i.status === 'done')}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-green-900/20"
            >
              <i className="fa-solid fa-download" /> Download ZIP
            </button>

            <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 ml-2">
               <button 
                onClick={() => setViewMode('list')}
                className={`w-9 h-8 flex items-center justify-center rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-800 text-purple-400 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
                title="List View"
               >
                 <i className="fa-solid fa-list text-sm" />
               </button>
               <button 
                onClick={() => setViewMode('grid')}
                className={`w-9 h-8 flex items-center justify-center rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-800 text-purple-400 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
                title="Grid View"
               >
                 <i className="fa-solid fa-grip text-sm" />
               </button>
            </div>
          </div>
        </header>

        {/* Series Controls Tray (Always below head area) */}
        {activeTab.batchGenerationMode === 'consistent_series' && (
           <div className="bg-slate-900 border border-purple-500/20 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300 shadow-xl shadow-purple-500/5">
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                   <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 pr-4 italic">Series Variations</h3>
                   <div className="flex gap-2">
                    {(['full-body', 'waist-up', 'chibi', 'item', 'texture', 'icon'] as BatchVariation[]).map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          const current = activeTab.batchVariations || [];
                          const next = current.includes(v) ? current.filter(x => x !== v) : [...current, v];
                          updateActiveTab({ batchVariations: next });
                        }}
                        className={`px-4 py-2 text-[11px] rounded-lg transition-all flex items-center gap-2 uppercase tracking-tighter border ${activeTab.batchVariations?.includes(v) ? 'bg-purple-600 border-purple-500 text-white font-black shadow-lg shadow-purple-900/40' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
                      >
                        <i className={`fa-solid ${activeTab.batchVariations?.includes(v) ? 'fa-square-check' : 'fa-square'}`} />
                        {v.replace('-', ' ')}
                      </button>
                    ))}
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-800 pl-6 h-12">
                 <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Auto-populate Variations</p>
                    <p className="text-[9px] text-slate-600 font-medium">Adds missing items for each name</p>
                 </div>
                 <button
                    onClick={handleExpandVariations}
                    disabled={activeTab.batchVariations?.length === 0}
                    className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2 uppercase tracking-tight bg-purple-600 text-white hover:bg-purple-500 font-black disabled:opacity-20 shadow-xl shadow-purple-900/20 active:scale-95"
                  >
                    <i className="fa-solid fa-magic-wand-sparkles" /> Populate Series
                  </button>
              </div>
           </div>
        )}

        {/* Quick Add Form */}
        <div className="bg-slate-900 border border-purple-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <i className="fa-solid fa-bolt text-purple-400" />
            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest italic whitespace-nowrap">Quick Add</span>
          </div>
          <div className="flex-1 flex gap-2 w-full">
             <input 
               type="text" 
               placeholder="Item Name | Item full description..." 
               value={quickAddText}
               onChange={e => setQuickAddText(e.target.value)}
               onKeyDown={e => {
                 if (e.key === 'Enter') handleQuickAdd();
               }}
               className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none"
             />
             <button 
               onClick={handleQuickAdd}
               disabled={!quickAddText.trim()}
               className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm uppercase italic tracking-widest transition-all"
             >
               Add
             </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-slate-800/40 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <button 
            onClick={() => {
              const nextState = !showInstructions;
              setShowInstructions(nextState);
              localStorage.setItem('mythic_batch_instructions', JSON.stringify(nextState));
            }}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-800/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3 text-purple-400">
              <i className="fa-solid fa-circle-info" />
              <h2 className="font-bold text-sm uppercase tracking-widest">File Format Instructions</h2>
            </div>
            <i className={`fa-solid fa-chevron-${showInstructions ? 'up' : 'down'} text-slate-600`} />
          </button>
          
          {showInstructions && (
            <div className="p-6 pt-0 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50">
                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <i className="fa-solid fa-layer-group" /> Standard Mode (3 Columns)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Format: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-white font-mono">Character Name | Aspect Ratio | Full Prompt</code>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-2 italic">Example: Knight | 3:4 | A noble knight in silver armor, standing in a forest.</p>
                  </div>

                  <div className="bg-purple-900/10 p-4 rounded-xl border border-purple-500/30">
                    <h4 className="text-[10px] font-black text-purple-300 uppercase tracking-widest mb-2 flex items-center gap-2 pr-4">
                       <i className="fa-solid fa-people-group" /> Series Mode (2 Columns)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-bold">
                      Format: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-white font-mono">Name | General Description</code>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Use this for character sheets. Provide a <span className="text-white">General Description</span> of the character's appearance (eyes, hair, clothing details, colors). 
                      <br/>Avoid "standing," "running," or framing words. 
                      <br/>Then use <span className="text-purple-300 font-bold">Populate Series</span> to auto-generate <span className="text-slate-300 italic">Chibi, Waist-Up, Full Body, Item, Texture, and Icon</span> variants.
                    </p>
                    <p className="text-[10px] text-slate-500 mt-2 italic">Example: Lyra | Female elf with glowing green eyes, silver lunar robes, and a wooden staff.</p>
                  </div>
                  
                  <div className="bg-orange-900/10 p-4 rounded-xl border border-orange-500/30">
                    <h4 className="text-[10px] font-black text-orange-300 uppercase tracking-widest mb-2 flex items-center gap-2 pr-4">
                       <i className="fa-solid fa-cube" /> Props, Textures & Icons (2 Columns)
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-2">
                      You can also use the Series Mode to define Props, Map Textures, or UI Icons.
                      <br/>Provide a <span className="text-white">General Description</span> of the prop, texture, or icon.
                      <br/>Select the <span className="text-slate-300 italic text-bold">Item</span>, <span className="text-slate-300 italic text-bold">Texture</span>, or <span className="text-slate-300 italic text-bold">Icon</span> variation, then use <span className="text-orange-300 font-bold">Populate Series</span>.
                    </p>
                    <p className="text-[10px] text-slate-500 mt-2 italic">Example: Stone Floor | A cracked cobblestone floor covered in moss</p>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Supported Aspect Ratios:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'].map(ratio => (
                      <span key={ratio} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-bold text-slate-300">{ratio}</span>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg">
                    <p className="text-[10px] font-bold text-purple-400 uppercase mb-1">PRO TIP: Consistent Series Mode</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Enable <span className="text-purple-300">Series Mode</span> to generate variations of the same character. 
                      If multiple items share the same <span className="font-bold underline italic">Name</span>, the system will use the first generated image as a visual reference for all others in that set.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Character Templates Section */}
        {templates.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-address-card text-purple-400 text-sm" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Character Bible Templates ({templates.length})</h3>
              </div>
              <button 
                onClick={handleExpandVariations}
                disabled={activeTab.batchVariations?.length === 0}
                className="px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 uppercase tracking-tighter bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white border border-purple-500/30 font-black text-[10px] disabled:opacity-20"
              >
                <i className="fa-solid fa-wand-magic-sparkles" /> Populate Variations
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(groupedTemplates).map(([fileName, items]: [string, BatchItem[]]) => {
                const isMinimized = minimizedFiles[`tmpl-${fileName}`];
                return (
                  <div key={fileName} className="col-span-full space-y-3">
                    <div className="flex items-center gap-3 px-2">
                       <button 
                          onClick={() => setMinimizedFiles(prev => ({ ...prev, [`tmpl-${fileName}`]: !isMinimized }))}
                          className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-white transition-colors"
                       >
                          <i className={`fa-solid fa-chevron-${isMinimized ? 'right' : 'down'} text-[9px]`} />
                       </button>
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{fileName}</span>
                    </div>
                    {!isMinimized && (
                      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3" : "grid grid-cols-1 gap-3"}>
                        {items.map((item) => (
                          <div key={item.id} className={`${viewMode === 'grid' ? 'aspect-square' : ''} bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 flex flex-col gap-2 relative group hover:border-purple-500/30 transition-all`}>
                             <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-purple-900/20 flex items-center justify-center border border-purple-500/10">
                                     <i className="fa-solid fa-user-tag text-purple-400 text-xs" />
                                  </div>
                                  <span className="text-xs font-black text-white uppercase italic tracking-wider truncate max-w-[120px]">{item.name}</span>
                               </div>
                               <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                 <button 
                                  onClick={() => handleExpandSingleTemplate(item)}
                                  title="Add variations for this character only"
                                  className="w-7 h-7 flex items-center justify-center text-purple-400 hover:bg-purple-400/10 rounded-lg transition-all"
                                 >
                                  <i className="fa-solid fa-plus-circle text-xs" />
                                 </button>
                                 <button 
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                 >
                                  <i className="fa-solid fa-trash-can text-xs" />
                                 </button>
                               </div>
                             </div>
                             <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed italic border-l-2 border-slate-800 pl-3 mt-1">
                               {item.prompt}
                             </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Queue List */}
        <div className="space-y-8">
          {/* Pending Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Pending Queue ({pendingItems.length} items)</h3>
                {pendingItems.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleAll(true)}
                      className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase"
                    >
                      Select All
                    </button>
                    <span className="text-slate-700">|</span>
                    <button 
                      onClick={() => toggleAll(false)}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-400 transition-colors uppercase"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>
              {queue.length > 0 && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleClearVariations} 
                    className="text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors uppercase flex items-center gap-1.5"
                    title="Remove all generated variations (Full Body, Waist Up, Chibi) but keep the original character prompts"
                  >
                    <i className="fa-solid fa-broom" /> Clear Variations
                  </button>
                  <span className="text-slate-800 text-xs">|</span>
                  <button onClick={handleClearQueue} className="text-[10px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase">
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {queue.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer hover:bg-slate-800/80 ${isDragging ? 'border-purple-500 bg-purple-500/5 text-purple-400' : 'border-slate-800 bg-slate-900/50 text-slate-600'}`}
              >
                <i className={`fa-solid ${isDragging ? 'fa-file-circle-plus animate-bounce' : 'fa-layer-group'} text-4xl opacity-20`} />
                <p className="text-sm font-medium opacity-40">
                  {isDragging ? 'Drop file to import prompts' : 'Click to select or drag and drop a prompt file here'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedPending).map(([fileName, items]: [string, BatchItem[]]) => {
                  const isMinimized = minimizedFiles[fileName];
                  return (
                    <div key={fileName} className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setMinimizedFiles(prev => ({ ...prev, [fileName]: !prev[fileName] }))}
                            className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-white transition-colors"
                          >
                            <i className={`fa-solid fa-chevron-${isMinimized ? 'right' : 'down'} text-[10px]`} />
                          </button>
                          <i className="fa-solid fa-file-lines text-slate-600 text-xs" />
                          <span className="text-xs font-bold text-slate-400">{fileName}</span>
                          <span className="text-[10px] text-slate-600 font-medium">({items.length} characters)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => toggleGroupEnabled(fileName, true)}
                            className="text-[9px] font-black text-purple-500/60 hover:text-purple-400 uppercase tracking-tighter"
                          >
                            Mark File
                          </button>
                          <span className="text-slate-800 text-[9px]">/</span>
                          <button 
                            onClick={() => toggleGroupEnabled(fileName, false)}
                            className="text-[9px] font-black text-slate-600 hover:text-slate-500 uppercase tracking-tighter"
                          >
                            Unmark
                          </button>
                        </div>
                      </div>
                      {!isMinimized && (
                        <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4" : "grid grid-cols-1 gap-2"}>
                          {items.map((item: BatchItem, idx: number) => (
                            viewMode === 'grid' ? (
                              <div 
                                key={item.id} 
                                className="relative group aspect-square rounded-xl bg-slate-950 border border-slate-800 overflow-hidden hover:border-purple-500/50 transition-all shadow-xl"
                                draggable={true}
                                onDragStart={(e) => {
                                  if (item.imageUrl) {
                                    e.dataTransfer.setData('text/plain', item.imageUrl);
                                    e.dataTransfer.setData('application/mythic-image-url', item.imageUrl);
                                  }
                                }}
                              >
                                  {item.imageUrl ? (
                                    <>
                                       <img src={item.imageUrl} className="w-full h-full object-cover" />
                                       <div className="absolute top-0 left-0 right-0 p-2 pt-1 pb-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                                          <span className="text-[9px] font-black text-white truncate block drop-shadow-md tracking-wider">
                                            {item.name.replace(/\[.*\]/g, '').trim()}
                                          </span>
                                       </div>
                                       <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                          <div className="flex items-center gap-2">
                                             <button 
                                                onClick={() => handleRetryItem(item.id)}
                                                className="w-8 h-8 flex items-center justify-center bg-purple-600 text-white rounded-full hover:bg-purple-500 transition-all hover:scale-110"
                                                title="Regenerate"
                                             >
                                                <i className="fa-solid fa-wand-magic-sparkles text-[11px]" />
                                             </button>
                                             <button 
                                                onClick={() => setLightboxUrl(item.imageUrl!)}
                                                className="w-8 h-8 flex items-center justify-center bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-all hover:scale-110"
                                                title="View"
                                             >
                                                <i className="fa-solid fa-expand text-[11px]" />
                                             </button>
                                          </div>
                                          <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">{item.name}</span>
                                       </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center">
                                       <i className={`fa-solid ${item.status === 'processing' ? 'fa-spinner fa-spin text-purple-500' : 'fa-image text-slate-800'} text-xl`} />
                                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest truncate w-full">{item.name}</span>
                                    </div>
                                  )}
                                  <button 
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-black/60 text-slate-400 hover:text-red-400 rounded-full opacity-100 group-hover:opacity-100 transition-opacity"
                                  >
                                    <i className="fa-solid fa-xmark text-[10px]" />
                                  </button>
                                  {item.status === 'failed' && (
                                    <div className="absolute bottom-2 left-2 right-2 p-1.5 bg-red-600 rounded text-[8px] font-black text-white uppercase text-center flex items-center justify-center gap-1">
                                       <i className="fa-solid fa-triangle-exclamation" /> Failed
                                    </div>
                                  )}
                               </div>
                            ) : (
                              <BatchItemCard 
                                key={item.id} 
                                item={item} 
                                isExpanded={expandedItems[item.id]}
                                onToggleExpand={() => toggleAccordion(item.id)}
                                onToggleEnabled={() => toggleItemEnabled(item.id)}
                                onRemove={() => handleRemoveItem(item.id)}
                                onRetry={() => handleRetryItem(item.id)}
                                onMoveUp={() => handleMoveItem(item.id, 'up')}
                                onMoveDown={() => handleMoveItem(item.id, 'down')}
                                onViewImage={setLightboxUrl}
                                onUpdatePrompt={(newPrompt) => updateItem(item.id, { prompt: newPrompt })}
                                onUpdateSkipReference={(skip) => updateItem(item.id, { skipReference: skip })}
                                onUpdateReferenceWeight={(weight) => updateItem(item.id, { referenceWeight: weight })}
                                onUpdateUsedReference={(url) => updateItem(item.id, { usedReferenceUrl: url })}
                                isFirst={idx === 0}
                                isLast={idx === items.length - 1}
                              />
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Done Section */}
          {doneItems.length > 0 && (
            <div className="space-y-6 pt-8 border-t border-slate-800/50">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-green-500 uppercase tracking-widest">Completed Series ({doneItems.length} items)</h3>
              </div>
              
              <div className="space-y-4">
                {(Object.entries(
                  doneItems.reduce((acc: Record<string, BatchItem[]>, item: BatchItem) => {
                    const baseName = item.name.split(' [')[0];
                    if (!acc[baseName]) acc[baseName] = [];
                    acc[baseName].push(item);
                    return acc;
                  }, {})
                ) as [string, BatchItem[]][]).map(([baseName, items]) => {
                  const isExpanded = expandedItems[`done-${baseName}`] ?? true;
                  return (
                    <div key={baseName} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                      <div 
                        className="p-4 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-900/80 transition-colors"
                        onClick={() => setExpandedItems(prev => ({ ...prev, [`done-${baseName}`]: !isExpanded }))}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center border border-purple-500/20">
                            <i className="fa-solid fa-users text-purple-400 text-sm" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white uppercase italic tracking-wide pr-6">{baseName}</h4>
                            <p className="text-[10px] text-slate-500 font-medium">{items.length} Variations Generated</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex -space-x-3 overflow-hidden pr-2">
                             {items.map((it, i) => (
                               <img key={it.id} src={it.imageUrl} className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-950 object-cover" />
                             ))}
                           </div>
                           <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-slate-600`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-black/20">
                          <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4" : "grid grid-cols-1 gap-2"}>
                            {items.map((item: BatchItem, idx: number) => (
                              viewMode === 'grid' ? (
                                <div 
                                  key={item.id} 
                                  className="relative group aspect-square rounded-xl bg-slate-950 border border-slate-800 overflow-hidden hover:border-purple-500/50 transition-all shadow-xl"
                                  draggable={true}
                                  onDragStart={(e) => {
                                    if (item.imageUrl) {
                                      e.dataTransfer.setData('text/plain', item.imageUrl);
                                      e.dataTransfer.setData('application/mythic-image-url', item.imageUrl);
                                    }
                                  }}
                                >
                                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                  <div className="absolute top-0 left-0 right-0 p-2 pt-1 pb-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                                     <span className="text-[9px] font-black text-white truncate block drop-shadow-md tracking-wider">
                                       {item.name.replace(/\[.*\]/g, '').trim()}
                                     </span>
                                  </div>
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                    <div className="flex items-center justify-between w-full px-3 absolute bottom-3">
                                      <span className="text-[10px] font-black text-white truncate pr-2 uppercase italic tracking-tighter">
                                        {item.name.includes('[') ? item.name.split('[')[1].replace(']', '') : 'Standard'}
                                      </span>
                                      <div className="flex gap-1">
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleRetryItem(item.id); }} 
                                          title="Regenerate" 
                                          className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-[10px] hover:bg-purple-500 transition-all hover:scale-110 active:scale-90 shadow-lg shadow-purple-900/40"
                                        >
                                          <i className="fa-solid fa-wand-magic-sparkles" />
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setLightboxUrl(item.imageUrl!); }} 
                                          title="View Full" 
                                          className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center text-white text-[10px] hover:bg-slate-600 transition-all hover:scale-110 active:scale-90"
                                        >
                                          <i className="fa-solid fa-expand" />
                                        </button>
                                        {item.status === 'pending' && (
                                           <button 
                                             onClick={(e) => { e.stopPropagation(); handleMarkDoneItem(item.id); }} 
                                             title="Cancel Retry & Keep Image" 
                                             className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-[10px] hover:bg-green-500 transition-all hover:scale-110 active:scale-90 shadow-lg shadow-green-900/40"
                                           >
                                             <i className="fa-solid fa-rotate-left" />
                                           </button>
                                        )}
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const coreName = item.name.split(' [')[0].trim().replace(/chibi|full\s*body|waist\s*up/gi, "").trim();
                                            const safeCharName = coreName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                                            const styleMatch = item.name.match(/\[(.*?)\]/);
                                            const styleSuffix = styleMatch ? `_${styleMatch[1].replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}` : '';
                                            const cleanItemName = `${safeCharName}${styleSuffix}`;
                                            const filename = `${cleanItemName}.png`;
                                            import('../../services/exportService').then(m => m.exportSingleImage(item.imageUrl!, filename));
                                          }}
                                          title="Download Character"
                                          className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-[10px] hover:bg-green-500 transition-all hover:scale-110 active:scale-90"
                                        >
                                          <i className="fa-solid fa-download" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-black text-white uppercase border border-white/10 tracking-widest leading-none">
                                    {item.aspectRatio}
                                  </div>
                                </div>
                              ) : (
                                <BatchItemCard 
                                  key={item.id} 
                                  item={item} 
                                  isExpanded={expandedItems[item.id]}
                                  onToggleExpand={() => toggleAccordion(item.id)}
                                  onToggleEnabled={() => toggleItemEnabled(item.id)}
                                  onRemove={() => handleRemoveItem(item.id)}
                                  onRetry={() => handleRetryItem(item.id)}
                                  onMarkDone={() => handleMarkDoneItem(item.id)}
                                  onViewImage={setLightboxUrl}
                                  onUpdatePrompt={(newPrompt) => updateItem(item.id, { prompt: newPrompt })}
                                  onUpdateSkipReference={(skip) => updateItem(item.id, { skipReference: skip })}
                                  onUpdateReferenceWeight={(weight) => updateItem(item.id, { referenceWeight: weight })}
                                  onUpdateUsedReference={(url) => updateItem(item.id, { usedReferenceUrl: url })}
                                  isFirst={idx === 0}
                                  isLast={idx === items.length - 1}
                                />
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {engine.batchIntervention && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-left"
          onClick={handleInterventionBackdropClick}
        >
          <div 
            className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl p-6 relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
             
             {/* Header */}
             <div className="flex items-center gap-4 mb-6">
                 <div className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-lg ${
                    engine.batchIntervention.isSafety 
                       ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' 
                       : 'bg-red-500/20 border-red-500/50 text-red-500'
                 }`}>
                     <i className={`fa-solid ${engine.batchIntervention.isSafety ? 'fa-shield-halved' : 'fa-triangle-exclamation'} text-xl`} />
                 </div>
                 <div>
                    <h2 className="text-xl font-bold text-white uppercase italic tracking-wide">
                        {engine.batchIntervention.isSafety ? 'Content Flagged' : 'Generation Failed'}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">
                       Item: <span className="text-white font-bold">{engine.batchIntervention.itemName}</span>
                    </p>
                 </div>
             </div>

             {/* Error Message */}
             <div className="p-4 bg-black/40 rounded-xl border border-slate-800 text-sm text-slate-300 font-medium mb-4 italic whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                 {engine.batchIntervention.errorMessage}
             </div>

             {/* Prompt Preview */}
             {engine.batchIntervention.itemPrompt && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500 font-medium mb-6 max-h-40 overflow-y-auto custom-scrollbar">
                   {engine.batchIntervention.itemPrompt}
                </div>
             )}

             {/* Description & Fix */}
             <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                 {engine.batchIntervention.isSafety 
                   ? "The generation was blocked due to safety guidelines. Would you like to automatically sanitize the prompt and retry, skip this item, or edit the prompt manually?"
                   : "An unexpected error occurred while generating this item. You can retry the same prompt, modify it, or completely skip and move to the next item in the batch."}
             </p>

             {/* Actions */}
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                 <button 
                    onClick={() => engine.batchIntervention!.resolve({ action: 'skip' })}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex flex-col items-center justify-center gap-1.5"
                 >
                    <i className="fa-solid fa-forward-step" />
                    Skip Item
                 </button>
                 
                 <button 
                    onClick={async () => {
                        const newP = await showInAppPrompt("Edit your prompt:", engine.batchIntervention!.itemPrompt, { title: "Edit Prompt" });
                        if (newP !== null) {
                            engine.batchIntervention!.resolve({ action: 'edit', newPrompt: newP });
                        }
                    }}
                    className="p-3 bg-blue-900/30 hover:bg-blue-600/50 text-blue-400 hover:text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors border border-blue-500/20 flex flex-col items-center justify-center gap-1.5"
                 >
                    <i className="fa-solid fa-pen-to-square" />
                    Edit Prompt
                 </button>

                 {engine.batchIntervention.isSafety ? (
                   <button 
                      onClick={() => engine.batchIntervention!.resolve({ action: 'sanitize' })}
                      className="p-3 bg-orange-600/80 hover:bg-orange-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg shadow-orange-900/20 flex flex-col items-center justify-center gap-1.5"
                   >
                      <i className="fa-solid fa-wand-magic-sparkles" />
                      Sanitize
                   </button>
                 ) : (
                   <button 
                      onClick={() => engine.batchIntervention!.resolve({ action: 'retry' })}
                      className="p-3 bg-purple-600/80 hover:bg-purple-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg shadow-purple-900/20 flex flex-col items-center justify-center gap-1.5"
                   >
                      <i className="fa-solid fa-rotate-right" />
                      Retry Now
                   </button>
                 )}

                 <button 
                    onClick={() => engine.batchIntervention!.resolve({ action: 'abort' })}
                    className="p-3 bg-red-900/30 hover:bg-red-600/50 text-red-500 hover:text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors border border-red-500/20 flex flex-col items-center justify-center gap-1.5"
                 >
                    <i className="fa-solid fa-stop" />
                    Abort
                 </button>
             </div>
          </div>
        </div>
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
};
