enum DeclarativeCommandPhase { computation, action }

enum DeclarativeValueKind { any, scalar, list, map }

class DeclarativeProgramException implements Exception {
  final String code;
  final String message;

  const DeclarativeProgramException(this.code, this.message);

  @override
  String toString() => 'DeclarativeProgramException($code): $message';
}

class CompiledDeclarativeCommand {
  final String id;
  final String type;
  final Map<String, dynamic> args;
  final String? requiredPermission;

  const CompiledDeclarativeCommand({
    required this.id,
    required this.type,
    required this.args,
    required this.requiredPermission,
  });
}

class CompiledDeclarativeProgram {
  final String id;
  final int version;
  final List<String> triggers;
  final Object? when;
  final List<CompiledDeclarativeCommand> commands;
  final Map<String, dynamic> outputs;
  final Set<String> requiredPermissions;

  const CompiledDeclarativeProgram({
    required this.id,
    required this.version,
    required this.triggers,
    required this.when,
    required this.commands,
    required this.outputs,
    required this.requiredPermissions,
  });
}

class DeclarativeProgramResult {
  final String programId;
  final Map<String, dynamic> outputs;

  const DeclarativeProgramResult({
    required this.programId,
    required this.outputs,
  });
}

class CompiledDeclarativeAction {
  final String type;
  final Map<String, dynamic> args;
  final String requiredPermission;
  final String contextSignature;
  final int programGeneration;

  const CompiledDeclarativeAction({
    required this.type,
    required this.args,
    required this.requiredPermission,
    required this.contextSignature,
    required this.programGeneration,
  });
}
