export function extractDesignFiles(lineItems: Array<Record<string, unknown>>) {
  const files: Array<Record<string, unknown>> = [];
  for (const item of lineItems) {
    const properties = normalizeProperties(item.properties);
    if (properties.length === 0) continue;
    const fileInfo: Record<string, unknown> = {
      lineItemTitle: item.title ?? item.name,
      variantTitle: item.variant_title ?? item.variantTitle,
      quantity: item.quantity,
      price: item.price ?? item.unitPrice,
      imageUrl: item.image_url ?? item.imageUrl ?? null,
    };
    for (const [name, value] of properties) {
      const lower = name.toLowerCase();
      if (!value) continue;
      const stringValue = String(value);
      if (lower.startsWith('_')
        && !['preview', 'upload', 'thumbnail', 'dpi', 'width', 'height', 'print'].some((token) => lower.includes(token))) {
        continue;
      }
      if (lower.includes('preview') || lower === '_preview') fileInfo.previewUrl = stringValue;
      if (lower.includes('print') && lower.includes('ready')) fileInfo.printReadyUrl = stringValue;
      if ((lower.includes('uploaded') || lower.includes('file_url') || lower.includes('file url')) && isUrl(stringValue)) {
        fileInfo.uploadedFileUrl = stringValue;
      }
      if (lower.includes('upload_id') || lower === '_ul_upload_id') fileInfo.uploadId = stringValue;
      if (lower.includes('thumbnail') || lower === '_ul_thumbnail') fileInfo.thumbnailUrl = stringValue;
      if (lower.includes('design_type') || lower === 'design type') fileInfo.designType = stringValue;
      if (lower.includes('file_name') || lower === 'file name' || lower === 'filename') fileInfo.fileName = stringValue;
      if (lower.includes('edit') && !lower.includes('admin') && isUrl(stringValue)) fileInfo.editUrl = stringValue;
      if (lower.includes('admin') && lower.includes('edit') && isUrl(stringValue)) fileInfo.adminEditUrl = stringValue;
      if (lower === 'dpi' || lower === '_dpi') fileInfo.dpi = Number.parseInt(stringValue, 10) || 300;
      if (lower.includes('width') && !lower.includes('screen')) fileInfo.rawWidth = stringValue;
      if (lower.includes('height') && !lower.includes('screen')) fileInfo.rawHeight = stringValue;
      if (!fileInfo.uploadedFileUrl && isUrl(stringValue)
        && ['image', 'file', 'artwork', 'design', 'photo', 'logo', 'graphic', 'attachment', 'gang sheet', 'proof'].some((token) => lower.includes(token))) {
        fileInfo.uploadedFileUrl = stringValue;
      }
    }
    if (!fileInfo.rawWidth && typeof item.variant_title === 'string') {
      const sizeMatch = item.variant_title.match(/(\d+\.?\d*)\s*[xXx]\s*(\d+\.?\d*)/);
      if (sizeMatch) {
        fileInfo.rawWidth = sizeMatch[1];
        fileInfo.rawHeight = sizeMatch[2];
      }
    }
    if (!fileInfo.dpi) fileInfo.dpi = 300;
    fileInfo.allProperties = properties.map(([name, value]) => ({ name, value }));
    if (fileInfo.previewUrl || fileInfo.printReadyUrl || fileInfo.uploadedFileUrl || fileInfo.editUrl || fileInfo.thumbnailUrl) {
      files.push(fileInfo);
    }
  }
  return files;
}

function normalizeProperties(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const name = String(record.name ?? record.key ?? '').trim();
      if (!name) return [];
      return [[name, record.value ?? record.val ?? ''] as [string, unknown]];
    });
  }
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>);
  return [];
}

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//');
}
