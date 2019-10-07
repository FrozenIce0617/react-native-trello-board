import React from 'react';
import {
  PanResponder,
  Animated,
  ScrollView,
  Platform,
  Dimensions,
  NativeModules,
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
    this.androidOffset = 0;
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
      this.androidOffset += (flag * this.WIDTH) / 20;
      console.log('Android Offset: ', this.androidOffset);
      // NativeModules.ScrollViewManager.getContentOffset(scrollCtl, offset => {
      //   console.log('ScrollView: ', offset);
      // });
      console.log('Ticking - ', offset);
      this.refs._scrollView.scrollTo({ x: newScrollPos, duration: 10 });
      this.scrollX = newScrollPos;
    }
  };

  onPanResponderMove(event, gesture, callback) {
    const leftTopCornerX = this.state.startingX + gesture.dx;
    const leftTopCornerY = this.state.startingY + gesture.dy;
    if (this.state.movingMode) {
      const draggedItem = this.state.draggedItem;
      let flag = 0;
      this.x = event.nativeEvent.pageX;
      this.y = event.nativeEvent.pageY;

      if (this.x < this.WIDTH / 10 || this.x > (this.WIDTH * 9) / 10) {
        flag = this.x < this.WIDTH / 10 ? -1 : 1;
        // if (Platform.OS !== 'ios') leftTopCornerX += this.state.offset;
      }

      const columnAtPosition = this.props.rowRepository.move(
        draggedItem,
        this.x + (Platform.OS === 'ios' ? 0 : this.androidOffset),
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

      this.setState({
        x: leftTopCornerX,
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
    this.props.clearInterval(this.timer);

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
        console.log('Layout X: ', x, ', Layout Y: ', y);
        this.props.rowRepository.hide(columnId, item);
        this.setState({
          movingMode: true,
          draggedItem: item,
          srcColumnId: item.columnId(),
          startingX: x,
          startingY: y,
          x: x,
          y: y,
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

  onScrollEnd = (event, param) => {
    this.props.rowRepository.updateColumnsLayoutAfterVisibilityChanged();
    console.log('Event: ', event.nativeEvent);
    this.verticalOffset = event.nativeEvent.contentOffset.x;
    this.androidOffset = this.verticalOffset;

    console.log('ScrollEnd: ', this.verticalOffset, this.androidOffset);
  };

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
      left:
        Platform.OS === 'ios'
          ? this.verticalOffset + this.state.x
          : this.androidOffset + this.state.x,
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
        scrollEventThrottle={1}
        onScrollEndDrag={this.onScrollEnd}
        onMomentumScrollEnd={this.onScrollEnd}
        horizontal
        {...this.panResponder.panHandlers}
      >
        {!this.state.movingMode && this.movingTask()}
        {columnWrappers}
        {this.state.movingMode && this.movingTask()}
      </ScrollView>
    );
  }
}

export default ReactTimeout(Board);
