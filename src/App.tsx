import React from 'react';
import { useAppEngine } from './hooks/useAppEngine';

// Modular Components
import AppSidebar from './components/layout/AppSidebar';
// Fix: Use default import for StudioLayout as it is exported as default from its module
import StudioLayout from './components/layout/StudioLayout';
import ExportDialog from './components/ui/ExportDialog';
import ConsolePanel from './components/ui/ConsolePanel';
import AssetPicker from './components/ui/AssetPicker';
import CropModal from './components/ui/CropModal';
import FolderPickerModal from './components/ui/FolderPickerModal';
import ErrorModal from './components/ui/ErrorModal';
import ShutdownModal from './components/ui/ShutdownModal';
import { InAppDialogModal } from './components/ui/InAppDialogModal';

// Views
import Dashboard from './components/views/Dashboard';
import Library from './components/views/Library';
import Settings from './components/views/Settings';
import Tutorials from './components/views/Tutorials';
import StyleLibrary from './components/views/StyleLibrary';
import Downloads from './components/views/Downloads';
import QuotaInspector from './components/views/QuotaInspector';
import MusicStudio from './components/views/MusicStudio';
import VideoStudio from './components/views/VideoStudio';
import TurnaroundStudio from './components/views/TurnaroundStudio';

export default function App() {
  const engine = useAppEngine();
  const [showShutdownModal, setShowShutdownModal] = React.useState(false);

  React.useEffect(() => {
    const handleOpen = () => setShowShutdownModal(true);
    window.addEventListener('mythic_open_shutdown_modal', handleOpen);
    return () => window.removeEventListener('mythic_open_shutdown_modal', handleOpen);
  }, []);

  // Unified check for modes that use the standard Studio Layout (Canvas + Bottom Panels)
  const isStudioMode = ['illustration', 'frame', 'background', 'fullcard', 'animation', 'resize', 'clothes', 'bg-replace', 'pixelize', 'gacha', 'ui-reimagine', 'pose-studio', 'map-grid', 'sprite-sheet', 'sprite-strip', 'batch'].includes(engine.mode);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-purple-500 selection:text-white">
      
      <ShutdownModal
        isOpen={showShutdownModal}
        onClose={() => setShowShutdownModal(false)}
      />

      <ExportDialog 
        isOpen={engine.showExport} 
        onClose={() => engine.setShowExport(false)} 
        currentEntry={engine.currentHistoryEntry}
        currentImage={engine.generatedImage}
        sessionImages={engine.sessionImages}
        mode={engine.mode}
        tabs={engine.tabs}
      />

      <ConsolePanel
        isOpen={engine.showConsole}
        onClose={() => engine.setShowConsole(false)}
        logs={engine.consoleLogs}
      />

      <ErrorModal
        error={engine.appError}
        onClose={() => engine.setAppError(null)}
        onOpenSettings={() => {
          engine.setAppError(null);
          engine.setMode('settings');
        }}
      />

      <InAppDialogModal />

      <AssetPicker 
        isOpen={engine.showAssetPicker}
        onClose={() => engine.setShowAssetPicker(false)}
        history={engine.history}
        onSelect={engine.handleAssetSelect}
      />

      {engine.showFolderPicker && (
         <FolderPickerModal
             isOpen={engine.showFolderPicker}
             onClose={() => engine.setShowFolderPicker(false)}
             onSelect={engine.handleFolderSelect}
         />
      )}

      {engine.generatedImage && (
         <CropModal
            isOpen={engine.showCropModal}
            onClose={() => engine.setShowCropModal(false)}
            imageUrl={engine.generatedImage}
            targetSize={engine.customRes}
            onApply={engine.handleApplyCrop}
            initialCrop={engine.safeZone.enabled ? { x: engine.safeZone.x, y: engine.safeZone.y, width: engine.safeZone.width, height: engine.safeZone.height } : undefined}
         />
      )}

      <AppSidebar 
        mode={engine.mode}
        setMode={engine.setMode}
        showHistory={engine.showHistory}
        setShowHistory={engine.setShowHistory}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {isStudioMode ? (
           <div className="flex h-full w-full">
               <StudioLayout engine={engine} />
           </div>
        ) : (
          /* PROJECT VIEWS */
          <>
             {engine.mode === 'dashboard' && (
               <Dashboard 
                 history={engine.history} 
                 onNavigate={engine.setMode} 
                 onOpenShutdown={() => setShowShutdownModal(true)} 
               />
             )}
             {engine.mode === 'library' && <Library history={engine.history} onRestore={engine.handleRestore} />}
             {engine.mode === 'downloads' && <Downloads exportHistory={engine.exports.exportHistory} onDelete={engine.exports.handleDeleteExport} onDownloadAgain={engine.exports.handleDownloadAgain} />}
             {engine.mode === 'style-library' && (
               <StyleLibrary 
                 customStyles={engine.customArtStyles} 
                 activeStyleIds={engine.activeStyleIds}
                 stylePreviews={engine.stylePreviews}
                 onAdd={engine.addCustomStyle} 
                 onUpdate={engine.updateCustomStyle} 
                 onDelete={engine.deleteCustomStyle} 
                 onToggleActive={engine.toggleStyleActive}
                 onUpdatePreview={engine.updateStylePreview}
                 // Fix: Added missing properties required by StyleLibraryProps (including onRemoveAll and onReorder)
                 onRemoveAll={engine.removeAllFromCollection}
                 onReorder={engine.reorderInCollection}
                 styleCollections={engine.styleCollections}
                 activeCollectionId={engine.activeCollectionId}
                 setActiveCollectionId={engine.setActiveCollectionId}
                 onAddCollection={engine.addStyleCollection}
                 onDeleteCollection={engine.deleteStyleCollection}
                 // Pass isGenerating to StyleLibrary to disable actions when the AI is busy
                 isGenerating={engine.isGenerating}
               />
             )}
             {engine.mode === 'tutorials' && <Tutorials />}
             {engine.mode === 'settings' && (
               <Settings 
                  gameContext={engine.gameContext} 
                  setGameContext={engine.setGameContext} 
                  apiKeyReady={engine.apiKeyReady} 
                  onConnect={engine.handleConnect} 
                  onRefreshKey={engine.handleRefreshKey}
                  driveFolderId={engine.driveFolderId}
                  setDriveFolderId={engine.setDriveFolderId}
                  driveFolderName={engine.driveFolderName}
                  setDriveFolderName={engine.setDriveFolderName}
                  onOpenFolderPicker={() => engine.setShowFolderPicker(true)}
                  allArtStyles={engine.allArtStyles}
                  onNavigate={engine.setMode}
               />
             )}
             {engine.mode === 'quota' && (
               <QuotaInspector 
                  apiKeyReady={engine.apiKeyReady} 
                  onNavigate={engine.setMode} 
               />
             )}
             {engine.mode === 'music' && (
               <MusicStudio onNavigate={engine.setMode} />
             )}
             {engine.mode === 'video' && (
               <VideoStudio onNavigate={engine.setMode} />
             )}
             {engine.mode === 'turnaround' && (
               <TurnaroundStudio engine={engine} onNavigate={engine.setMode} />
             )}
          </>
        )}
      </div>

    </div>
  );
}
