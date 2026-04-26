import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderOpen, FileJson, Import } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import {
  Button,
  Label,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { TImportResponse, TStartupConfig } from 'librechat-data-provider';
import { useUploadConversationsMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

type DirectoryInputElement = HTMLInputElement & {
  webkitdirectory?: boolean;
  directory?: boolean;
};

type DirectoryFile = File & {
  webkitRelativePath?: string;
};

function ImportConversations() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const folderInput = folderInputRef.current as DirectoryInputElement | null;
    if (folderInput == null) {
      return;
    }

    folderInput.webkitdirectory = true;
    folderInput.directory = true;
  }, []);

  const getSuccessMessage = useCallback(
    (data?: TImportResponse) => {
      const importedCount = data?.importedCount;
      const totalCount = data?.totalCount;
      const skippedCount = data?.skippedCount ?? 0;

      if (typeof importedCount !== 'number' || typeof totalCount !== 'number') {
        return localize('com_ui_import_conversation_success');
      }

      const summary = localize('com_ui_import_conversation_summary', {
        0: String(importedCount),
        1: String(totalCount),
      });

      if (skippedCount === 0) {
        return summary;
      }

      return `${summary} ${localize('com_ui_import_conversation_skipped', {
        0: String(skippedCount),
      })}`;
    },
    [localize],
  );

  const handleSuccess = useCallback(
    (data: TImportResponse) => {
      showToast({
        message: getSuccessMessage(data),
        status: NotificationSeverity.SUCCESS,
      });
      setIsDialogOpen(false);
      setIsUploading(false);
    },
    [getSuccessMessage, showToast],
  );

  const handleError = useCallback(
    (error: unknown) => {
      logger.error('Import error:', error);
      setIsUploading(false);

      const isUnsupportedType = error?.toString().includes('Unsupported import type');

      showToast({
        message: localize(
          isUnsupportedType
            ? 'com_ui_import_conversation_file_type_error'
            : 'com_ui_import_conversation_error',
        ),
        status: NotificationSeverity.ERROR,
      });
    },
    [localize, showToast],
  );

  const uploadFile = useUploadConversationsMutation({
    onSuccess: handleSuccess,
    onError: handleError,
    onMutate: () => setIsUploading(true),
  });

  const handleFileUpload = useCallback(
    async (file: File) => {
      try {
        const startupConfig = queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]);
        const maxFileSize = startupConfig?.conversationImportMaxFileSize;

        if (maxFileSize && file.size > maxFileSize) {
          const size = (maxFileSize / (1024 * 1024)).toFixed(2);
          showToast({
            message: localize('com_error_files_upload_too_large', { 0: size }),
            status: NotificationSeverity.ERROR,
          });
          setIsUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file, encodeURIComponent(file.name || 'File'));
        setIsDialogOpen(false);
        uploadFile.mutate(formData);
      } catch (error) {
        logger.error('File processing error:', error);
        setIsUploading(false);
        showToast({
          message: localize('com_ui_import_conversation_upload_error'),
          status: NotificationSeverity.ERROR,
        });
      }
    },
    [uploadFile, showToast, localize, queryClient],
  );

  const handleJsonFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleFileUpload(file);
      }
      event.target.value = '';
    },
    [handleFileUpload],
  );

  const handleFolderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []) as DirectoryFile[];
      const conversationFile = files.find((file) => {
        const relativePath = file.webkitRelativePath ?? '';
        return file.name === 'conversations.json' || relativePath.endsWith('/conversations.json');
      });

      if (conversationFile == null) {
        showToast({
          message: localize('com_ui_import_conversation_folder_missing'),
          status: NotificationSeverity.ERROR,
        });
        event.target.value = '';
        return;
      }

      void handleFileUpload(conversationFile);
      event.target.value = '';
    },
    [handleFileUpload, localize, showToast],
  );

  const openJsonPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openFolderPicker = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  return (
    <div className="flex items-center justify-between">
      <Label id="import-conversation-label">{localize('com_ui_import_conversation_info')}</Label>
      <Button
        variant="outline"
        onClick={() => setIsDialogOpen(true)}
        disabled={isUploading}
        aria-label={localize('com_ui_import')}
        aria-labelledby="import-conversation-label"
      >
        {isUploading ? (
          <>
            <Spinner className="mr-1 w-4" />
            <span>{localize('com_ui_importing')}</span>
          </>
        ) : (
          <>
            <Import className="mr-1 flex h-4 w-4 items-center stroke-1" aria-hidden="true" />
            <span>{localize('com_ui_import')}</span>
          </>
        )}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".json"
        onChange={handleJsonFileChange}
        aria-hidden="true"
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleFolderChange}
        aria-hidden="true"
      />
      <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <OGDialogContent className="sm:max-w-md">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_import_conversation_modal_title')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="space-y-4 text-sm text-text-primary">
            <p>{localize('com_ui_import_conversation_modal_description')}</p>
            <p className="text-text-secondary">
              {localize('com_ui_import_conversation_dedupe_note')}
            </p>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={openJsonPicker}
                disabled={isUploading}
              >
                <FileJson className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{localize('com_ui_import_conversation_select_json')}</span>
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={openFolderPicker}
                disabled={isUploading}
              >
                <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{localize('com_ui_import_chatgpt_folder')}</span>
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}

export default ImportConversations;
