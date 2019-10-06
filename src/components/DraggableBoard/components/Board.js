import React from 'react';
import {
  PanResponder,
  Animated,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import _ from 'underscore';
import ReactTimeout from 'react-timeout';

import Column from './Column';
import TaskWrapper from './TaskWrapper';

class Board extends React.Component {
  MAX_RANGE = 100;
  MAX_DEG = 30;
  TRESHOLD = 35;
  WIDTH = Dimensions.get('window').width;

  constructor(props) {
    super(props);

    this.verticalOffset = 0;
    this.scrollX = 0;
    this.timer = null;
    this.x = 0;
    this.y = 0;
    this.state = {
      rotate: new Animated.Value(0),
      startingX: 0,
      startingY: 0,
      x: 0,
      y: 0,
      movingMode: false,
      flag: 0,
      offset: 0,
    };

    this.panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => this.state.movingMode,
      onMoveShouldSetPanResponder: () => this.state.movingMode,
      onPanResponderTerminationRequest: () => !this.state.movingMode,
      onPanResponderMove: this.onPanResponderMove.bind(this),
      onPanResponderRelease: this.onPanResponderRelease.bind(this),
      onPanResponderTerminate: this.onPanResponderRelease.bind(this),
    });
  }

  componentWillUnmount() {
    this.unsubscribeFromMovingMode();
  }

  tick = () => {
    const { x, offset, movingMode, flag } = this.state;

    if (!movingMode || !flag) return;

    if (Platform.OS === 'ios') {
      if (this.scrollX + (this.WIDTH / 5) * flag < 0) return;
      if (this.scrollX + (this.WIDTH / 5) * flag - 180 > this.WIDTH) return;

      let newScrollPos = this.scrollX + (this.WIDTH / 5) * flag;
      this.refs._scrollView.scrollTo({ x: newScrollPos, duration: 100 });
      this.scrollX = newScrollPos;
    } else {
      if (this.scrollX + (this.WIDTH / 20) * flag < 0) return;
      if (this.scrollX + (this.WIDTH / 20) * flag - 150 > this.WIDTH) return;

      let newScrollPos = this.scrollX + (this.WIDTH / 20) * flag;
      this.refs._scrollView.scrollTo({ x: newScrollPos, duration: 100 });
      this.scrollX = newScrollPos;
      this.setState({
        offset: offset + (flag * this.WIDTH) / 20,
      });
    }
  };

  onPanResponderMove(event, gesture, callback) {
    let leftTopCornerX = this.state.startingX + gesture.dx;
    console.log('Offset: ', this.state.offset);
    const leftTopCornerY = this.state.startingY + gesture.dy;
    if (this.state.movingMode) {
      const draggedItem = this.state.draggedItem;
      let flag = 0;
      this.x = event.nativeEvent.pageX;
      this.y = event.nativeEvent.pageY;
      console.log('x: ', this.x, ', y: ', this.y);

      if (this.x < this.WIDTH / 10 || this.x > (this.WIDTH * 9) / 10) {
        flag = this.x < this.WIDTH / 10 ? -1 : 1;
        // if (Platform.OS !== 'ios') leftTopCornerX += this.state.offset;
      }
      const columnAtPosition = this.props.rowRepository.move(
        draggedItem,
        this.x,
        this.y,
      );
      if (columnAtPosition) {
        let { scrolling, offset } = this.props.rowRepository.scrollingPosition(
          columnAtPosition,
          this.x,
          this.y,
        );
        if (this.shouldScroll(scrolling, offset, columnAtPosition)) {
          this.scroll(columnAtPosition, draggedItem, offset);
        }
      }
      console.log('LeftTopCornerX: ', leftTopCornerX);

      this.setState({
        x: leftTopCornerX + Math.abs(flag) * this.state.offset,
        y: leftTopCornerY,
        flag,
      });
    }
  }

  shouldScroll(scrolling, offset, column) {
    const placeToScroll =
      (offset < 0 && column.scrollOffset() > 0) ||
      (offset > 0 && column.scrollOffset() < column.contentHeight());

    return scrolling && offset != 0 && placeToScroll;
  }

  onScrollingStarted() {
    this.scrolling = true;
  }

  onScrollingEnded() {
    this.scrolling = false;
  }

  isScrolling() {
    return this.scrolling;
  }

  scroll(column, draggedItem, anOffset) {
    if (!this.isScrolling()) {
      this.onScrollingStarted();
      const scrollOffset = column.scrollOffset() + 70 * anOffset;
      this.props.rowRepository.setScrollOffset(column.id(), scrollOffset);

      column.listView().scrollTo({ y: scrollOffset });
    }

    this.props.rowRepository.move(draggedItem, this.x, this.y);
    let { scrolling, offset } = this.props.rowRepository.scrollingPosition(
      column,
      this.x,
      this.y,
    );
    if (this.shouldScroll(scrolling, offset, column)) {
      this.props.requestAnimationFrame(() => {
        this.scroll(column, draggedItem, offset);
      });
    }
  }

  endMoving() {
    this.setState({ movingMode: false, offset: 0 });
    const { srcColumnId, draggedItem } = this.state;
    const { rowRepository, onDragEnd } = this.props;
    rowRepository.show(draggedItem.columnId(), draggedItem);
    rowRepository.notify(draggedItem.columnId(), 'reload');

    const destColumnId = draggedItem.columnId();
    onDragEnd && onDragEnd(srcColumnId, destColumnId, draggedItem);
  }

  onPanResponderRelease(e, gesture) {
    this.x = null;
    this.y = null;
    if (this.state.movingMode) {
      this.rotateBack();
      this.props.setTimeout(this.endMoving.bind(this), 200);
    } else if (this.isScrolling()) {
      this.unsubscribeFromMovingMode();
    }
    clearInterval(this.timer);
  }

  rotateTo(value) {
    Animated.spring(this.state.rotate, {
      toValue: value,
      duration: 5000,
    }).start();
  }

  rotate() {
    this.rotateTo(this.MAX_DEG);
  }

  rotateBack() {
    this.rotateTo(0);
  }

  open(row) {
    this.props.open(row);
  }

  cancelMovingSubscription() {
    this.props.clearTimeout(this.movingSubscription);
  }

  unsubscribeFromMovingMode() {
    this.cancelMovingSubscription();
  }

  onPressIn(columnId, item, columnCallback) {
    if (item.isLocked()) {
      return;
    }
    return () => {
      if (!item || (item.isLocked() && this.isScrolling())) {
        this.unsubscribeFromMovingMode();
        return;
      }
      this.movingSubscription = this.props.setTimeout(() => {
        if (!item || !item.layout()) {
          return;
        }
        const { x, y } = item.layout();
        this.props.rowRepository.hide(columnId, item);
        this.setState({
          movingMode: true,
          draggedItem: item,
          srcColumnId: item.columnId(),
          startingX: x,
          startingY: y,
          x: x,
          y: y,
          offset: 0,
        });
        columnCallback();
        this.rotate();

        const timerInterval = Platform.OS === 'ios' ? 100 : 500;
        const timer = this.props.setInterval(this.tick, timerInterval);
        this.timer = timer;
      }, this.longPressDuration());
    };
  }

  longPressDuration() {
    this.setState({ offset: 0 });
    return Platform.OS === 'ios' ? 200 : 100;
  }

  onPress(item) {
    if (item.isLocked()) {
      return;
    }

    return () => {
      this.unsubscribeFromMovingMode();

      if (item.isLocked()) {
        return;
      }

      if (!this.state.movingMode) {
        this.open(item.row());
      } else {
        this.endMoving();
      }
    };
  }

  onScroll(event) {
    this.cancelMovingSubscription();
    const scrollX = event.nativeEvent.contentOffset.x;

    this.scrollX = scrollX;
    this.x = scrollX;
    this.setState({
      scrollX,
    });
  }

  onScrollEnd(event) {
    this.props.rowRepository.updateColumnsLayoutAfterVisibilityChanged();
    this.verticalOffset = event.nativeEvent.contentOffset.x;
  }

  movingStyle(zIndex) {
    const interpolatedRotateAnimation = this.state.rotate.interpolate({
      inputRange: [-this.MAX_RANGE, 0, this.MAX_RANGE],
      outputRange: [`-${this.MAX_DEG}deg`, '0deg', `${this.MAX_DEG}deg`],
    });
    return {
      transform: [{ rotate: interpolatedRotateAnimation }],
      position: 'absolute',
      zIndex: zIndex,
      top: Platform.OS === 'ios' ? this.state.y - this.TRESHOLD : this.state.y,
      // left: this.verticalOffset + this.state.x,
      left:
        Platform.OS === 'ios'
          ? this.verticalOffset + this.state.x
          : this.verticalOffset + this.state.x + this.state.offset,
    };
  }

  movingTask() {
    const { draggedItem, movingMode } = this.state;
    // Without this when you drop a task it's impossible to drag it again...
    // And -1 is really needed for Android
    const zIndex = movingMode ? 1 : -1;
    const data = {
      item: draggedItem,
      hidden: !movingMode,
      style: this.movingStyle(zIndex),
    };
    return this.renderWrapperRow(data);
  }

  renderWrapperRow(data) {
    const { renderRow } = this.props;
    return (
      <TaskWrapper {...data}>
        {renderRow && data.item && renderRow(data.item.row())}
      </TaskWrapper>
    );
  }

  render() {
    const columns = this.props.rowRepository.columns();
    const columnWrappers = columns.map(column => {
      const columnComponent = (
        <Column
          column={column}
          movingMode={this.state.movingMode}
          rowRepository={this.props.rowRepository}
          onPressIn={this.onPressIn.bind(this)}
          onPress={this.onPress.bind(this)}
          onPanResponderMove={this.onPanResponderMove.bind(this)}
          onPanResponderRelease={this.onPanResponderRelease.bind(this)}
          renderWrapperRow={this.renderWrapperRow.bind(this)}
          onScrollingStarted={this.onScrollingStarted.bind(this)}
          onScrollingEnded={this.onScrollingEnded.bind(this)}
          unsubscribeFromMovingMode={this.cancelMovingSubscription.bind(this)}
        />
      );
      return this.props.renderColumnWrapper(
        column.data(),
        column.index(),
        columnComponent,
      );
    });

    return (
      <ScrollView
        ref="_scrollView"
        style={this.props.style}
        contentContainerStyle={this.props.contentContainerStyle}
        scrollEnabled={!this.state.movingMode}
        onScroll={this.onScroll.bind(this)}
        scrollEventThrottle={16}
        onScrollEndDrag={this.onScrollEnd.bind(this)}
        onMomentumScrollEnd={this.onScrollEnd.bind(this)}
        horizontal
        {...this.panResponder.panHandlers}
      >
        {columnWrappers}
        {this.movingTask()}
      </ScrollView>
    );
  }
}

export default ReactTimeout(Board);
