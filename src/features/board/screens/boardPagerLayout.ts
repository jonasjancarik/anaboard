export const WIDE_BOARD_BREAKPOINT = 736;
export const BOARD_SPREAD_GAP = 16;

export const clampPageIndex = (pageIndex: number, pageCount: number) => {
  if (pageCount <= 1) {
    return 0;
  }

  return Math.max(0, Math.min(pageCount - 1, pageIndex));
};

export const normalizeBoardPageIndex = (
  pageIndex: number,
  pageCount: number,
  visiblePagesPerSpread: number
) => {
  const clampedPageIndex = clampPageIndex(pageIndex, pageCount);
  const spreadIndex = Math.floor(clampedPageIndex / visiblePagesPerSpread);

  return spreadIndex * visiblePagesPerSpread;
};

export const getSpreadCount = (pageCount: number, visiblePagesPerSpread: number) => {
  if (pageCount <= 1) {
    return 1;
  }

  return Math.ceil(pageCount / visiblePagesPerSpread);
};

export const getSpreadIndexForPage = (pageIndex: number, visiblePagesPerSpread: number) => {
  return Math.floor(pageIndex / visiblePagesPerSpread);
};

export const getSpreadOffset = (spreadIndex: number, spreadWidth: number) => {
  return spreadIndex * spreadWidth;
};

export const getLogicalPageWidth = (
  spreadWidth: number,
  visiblePagesPerSpread: number,
  spreadGap: number
) => {
  if (visiblePagesPerSpread <= 1) {
    return spreadWidth;
  }

  return Math.max(
    0,
    (spreadWidth - spreadGap * (visiblePagesPerSpread - 1)) / visiblePagesPerSpread
  );
};

export const getPageLeft = (
  pageIndex: number,
  visiblePagesPerSpread: number,
  spreadWidth: number,
  logicalPageWidth: number,
  spreadGap: number
) => {
  const spreadIndex = getSpreadIndexForPage(pageIndex, visiblePagesPerSpread);
  const pageOffsetWithinSpread = pageIndex - spreadIndex * visiblePagesPerSpread;

  return (
    getSpreadOffset(spreadIndex, spreadWidth) +
    pageOffsetWithinSpread * (logicalPageWidth + spreadGap)
  );
};

export const getPageIndexForContentX = (
  contentX: number,
  pageCount: number,
  visiblePagesPerSpread: number,
  spreadWidth: number,
  logicalPageWidth: number,
  spreadGap: number
) => {
  if (pageCount <= 1 || spreadWidth <= 0) {
    return 0;
  }

  const spreadCount = getSpreadCount(pageCount, visiblePagesPerSpread);
  const clampedContentX = Math.max(0, contentX);
  const spreadIndex = Math.max(
    0,
    Math.min(spreadCount - 1, Math.floor(clampedContentX / spreadWidth))
  );

  if (visiblePagesPerSpread <= 1) {
    return clampPageIndex(spreadIndex, pageCount);
  }

  const spreadLeft = getSpreadOffset(spreadIndex, spreadWidth);
  const offsetWithinSpread = clampedContentX - spreadLeft;
  const midpoint = logicalPageWidth + spreadGap / 2;
  const pageOffsetWithinSpread = offsetWithinSpread >= midpoint ? 1 : 0;

  return clampPageIndex(
    spreadIndex * visiblePagesPerSpread + pageOffsetWithinSpread,
    pageCount
  );
};
