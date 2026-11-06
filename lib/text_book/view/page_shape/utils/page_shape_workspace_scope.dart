import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:otzaria/workspaces/bloc/workspace_bloc.dart';

/// מזהה שולחן העבודה הפעיל, או null כשאין WorkspaceBloc בעץ (בדיקות, פתיחה
/// עצמאית של מסך צורת הדף).
String? activePageShapeWorkspaceId(BuildContext context) {
  try {
    return context.read<WorkspaceBloc>().state.activeWorkspaceId;
  } catch (_) {
    return null;
  }
}
