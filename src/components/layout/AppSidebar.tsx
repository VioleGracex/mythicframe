import React, { useState, useEffect } from 'react';
import { UIMode } from '../../types';
import { MODE_CONFIG } from '../../constants';
import { useLanguage } from '../../i18n/LanguageContext';

interface AppSidebarProps {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
  setShowHistory: (show: boolean) => void;
  showHistory: boolean;
}

const Icon = ({ name, className = "" }: { name: string, className?: string }) => <i className={`fa-solid ${name} ${className}`}></i>;

const AppSidebar: React.FC<AppSidebarProps> = ({
  mode, setMode, setShowHistory, showHistory
}) => {
  const { t } = useLanguage();
  const [isMinimized, setIsMinimized] = useState(() => localStorage.getItem('mythic_sidebar_minimized') === 'true');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('mythic_sidebar_sections');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      project: true,
      character: true,
      world: true,
      production: true
    };
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    localStorage.setItem('mythic_sidebar_minimized', String(isMinimized));
  }, [isMinimized]);

  useEffect(() => {
    localStorage.setItem('mythic_sidebar_sections', JSON.stringify(expandedSections));
  }, [expandedSections]);
  
  const NavButton = ({ targetMode }: { targetMode: UIMode }) => (
    <button
      onClick={() => setMode(targetMode)}
      title={isMinimized ? t(targetMode as any) : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all mb-1 ${
        mode === targetMode 
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      } ${isMinimized ? 'justify-center px-0' : ''}`}
    >
      <div className={`w-6 flex justify-center ${mode === targetMode ? 'text-white' : 'text-slate-50'}`}>
         <Icon name={MODE_CONFIG[targetMode].icon} />
      </div>
      {!isMinimized && <div className="font-medium text-sm truncate">{t(targetMode as any)}</div>}
    </button>
  );

  const CategoryHeader = ({ label, section, icon }: { label: string, section: string, icon: string }) => {
    if (isMinimized) return <div className="h-px bg-slate-800/80 my-3 mx-2 opacity-50" />;
    
    const isExpanded = expandedSections[section];
    const categoryKeyMap: Record<string, any> = {
      project: 'cat_project',
      character: 'cat_character',
      world: 'cat_world',
      production: 'cat_production'
    };
    const displayLabel = categoryKeyMap[section] ? t(categoryKeyMap[section]) : label;
    
    return (
      <button 
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between px-3 py-2 mb-2 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/50 rounded-lg transition-colors group cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-400 group-hover:text-purple-400 transition-colors">
            <Icon name={icon} className="text-[10px]" />
          </div>
          <span className="text-[10px] font-black text-slate-200 uppercase tracking-[0.15em]">{displayLabel}</span>
        </div>
        <Icon 
          name="fa-chevron-down" 
          className={`text-[8px] text-slate-500 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-0' : '-rotate-90'}`} 
        />
      </button>
    );
  };

  const isStudioMode = ['illustration', 'frame', 'background', 'fullcard', 'animation', 'resize', 'clothes', 'bg-replace', 'pixelize', 'gacha', 'ui-reimagine', 'pose-studio', 'map-grid', 'sprite-sheet', 'sprite-strip', 'batch'].includes(mode);

  return (
    <div className={`${isMinimized ? 'w-16' : 'w-64'} h-full bg-slate-950 border-r border-slate-900 flex flex-col shrink-0 transition-all duration-300 overflow-hidden z-50 select-none`}>
      {/* Top Brand Header */}
      <div className={`p-6 shrink-0 ${isMinimized ? 'px-0 flex justify-center' : ''}`}>
        {!isMinimized ? (
          <>
            <h1 className="text-xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight">
              MYTHIC<span className="text-white">FRAME</span>
            </h1>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">AI Game Asset Studio</p>
          </>
        ) : (
          <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-black text-white text-xs shadow-md shadow-purple-900/30">M</div>
        )}
      </div>

      {/* Scrollable Nav Section */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 py-1">
        {/* Project Section */}
        <div className={`${isMinimized ? 'px-2' : 'px-4'} mb-3`}>
           <CategoryHeader label="Project" section="project" icon="fa-folder-tree" />
           <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
             expandedSections.project || isMinimized ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
           }`}>
             <div className="overflow-hidden space-y-0.5">
               <NavButton targetMode="dashboard" />
               <NavButton targetMode="library" />
               <NavButton targetMode="style-library" />
               <NavButton targetMode="downloads" />
               <NavButton targetMode="quota" />
               <NavButton targetMode="settings" />
               <NavButton targetMode="tutorials" />
             </div>
           </div>
        </div>

        {/* Character Studio Section */}
        <div className={`${isMinimized ? 'px-2' : 'px-4'} mb-3`}>
           <CategoryHeader label="Character Studio" section="character" icon="fa-user-gear" />
           <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
             expandedSections.character || isMinimized ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
           }`}>
             <div className="overflow-hidden space-y-0.5">
               <NavButton targetMode="illustration" />
               <NavButton targetMode="sprite-sheet" />
               <NavButton targetMode="sprite-strip" />
               <NavButton targetMode="pose-studio" />
               <NavButton targetMode="gacha" />
               <NavButton targetMode="clothes" />
             </div>
           </div>
        </div>

        {/* World & UI Section */}
        <div className={`${isMinimized ? 'px-2' : 'px-4'} mb-3`}>
           <CategoryHeader label="World & UI" section="world" icon="fa-earth-americas" />
           <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
             expandedSections.world || isMinimized ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
           }`}>
             <div className="overflow-hidden space-y-0.5">
               <NavButton targetMode="background" />
               <NavButton targetMode="bg-replace" />
               <NavButton targetMode="frame" />
               <NavButton targetMode="ui-reimagine" />
               <NavButton targetMode="map-grid" />
             </div>
           </div>
        </div>

        {/* Production Section */}
        <div className={`${isMinimized ? 'px-2' : 'px-4'} mb-3`}>
           <CategoryHeader label="Production" section="production" icon="fa-wand-magic-sparkles" />
           <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
             expandedSections.production || isMinimized ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
           }`}>
             <div className="overflow-hidden space-y-0.5">
               <NavButton targetMode="pixelize" />
               <NavButton targetMode="resize" />
               <NavButton targetMode="animation" />
               <NavButton targetMode="batch" />
               <NavButton targetMode="video" />
               <NavButton targetMode="music" />
             </div>
           </div>
        </div>
      </div>

      {/* Permanently Pinned Bottom Dock Controls */}
      <div className="shrink-0 p-3 border-t border-slate-900 bg-slate-950 space-y-2 z-10">
         {isStudioMode && mode !== 'tutorials' && (
           <button 
             onClick={() => setShowHistory(!showHistory)} 
             className={`w-full text-slate-300 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors ${showHistory ? 'bg-slate-800 text-purple-400 border-purple-500/30' : 'bg-transparent'} ${isMinimized ? 'px-0' : ''}`}
             title={t('recent_work')}
           >
              <Icon name="fa-clock-rotate-left" /> {!isMinimized && <span>{t('recent_work')}</span>}
           </button>
         )}
         <button 
           type="button"
           onClick={() => setIsMinimized(!isMinimized)}
           className="w-full h-8 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 flex items-center justify-center transition-all group cursor-pointer"
           title={isMinimized ? t('expand_sidebar') : t('minimize_sidebar')}
         >
           <i className={`fa-solid fa-chevron-${isMinimized ? 'right' : 'left'} text-xs group-hover:scale-110 transition-transform`} />
         </button>
      </div>
    </div>
  );
};

export default AppSidebar;